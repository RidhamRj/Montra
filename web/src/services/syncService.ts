import { db } from "../db/expenseDb";
import { supabase } from "../lib/supabase";
import type { SyncOutbox, Transaction } from "../types";

const LAST_SYNC_KEY = "last_successful_sync";
const PUSH_BATCH_SIZE = 100;
const PULL_PAGE_SIZE = 500;
const MAX_ATTEMPTS = 5;

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  offline: boolean;
  error?: string;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? false : navigator.onLine;
}

async function markOutboxFailure(entry: SyncOutbox): Promise<void> {
  const attempts = entry.attempts + 1;

  await db.transaction("rw", db.syncOutbox, db.transactions, async () => {
    await db.syncOutbox.update(entry.id, { attempts });

    if (attempts >= MAX_ATTEMPTS && entry.entityType === "transaction") {
      await db.transactions.update(entry.entityId, { syncStatus: "failed" });
    }
  });
}

async function markOutboxSynced(entry: SyncOutbox): Promise<void> {
  await db.transaction("rw", db.syncOutbox, db.transactions, async () => {
    if (entry.entityType === "transaction") {
      const local = await db.transactions.get(entry.entityId);
      const pushedUpdatedAt = (entry.payload as { updatedAt?: string })
        .updatedAt;

      if (local && local.updatedAt === pushedUpdatedAt) {
        await db.transactions.update(local.id, { syncStatus: "synced" });
      }
    }

    await db.syncOutbox.delete(entry.id);
  });
}

function toRemoteRow(t: Partial<Transaction>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.id !== undefined) row.id = t.id;
  if (t.userId !== undefined) row.user_id = t.userId;
  if (t.amount !== undefined) row.amount = t.amount;
  if (t.type !== undefined) row.type = t.type;
  if (t.categoryId !== undefined) row.category_id = t.categoryId || null;
  if (t.description !== undefined) row.description = t.description;
  if (t.partyName !== undefined) row.party_name = t.partyName;
  if (t.paymentMethod !== undefined) row.payment_method = t.paymentMethod;
  if (t.source !== undefined) row.source = t.source;
  if (t.externalReference !== undefined) row.external_reference = t.externalReference;
  if (t.occurredAt !== undefined) row.occurred_at = t.occurredAt;
  if (t.reviewStatus !== undefined) row.review_status = t.reviewStatus;
  if (t.createdAt !== undefined) row.client_created_at = t.createdAt;
  if (t.updatedAt !== undefined) row.client_updated_at = t.updatedAt;
  if (t.deletedAt !== undefined) row.deleted_at = t.deletedAt;
  return row;
}

function fromRemoteRow(r: Record<string, unknown>): Transaction {
  return {
    id: String(r.id),
    userId: String(r.user_id || ""),
    amount: Number(r.amount),
    type: r.type as "expense" | "income",
    categoryId: String(r.category_id || ""),
    description: String(r.description || ""),
    partyName: r.party_name ? String(r.party_name) : null,
    paymentMethod: (r.payment_method || "cash") as any,
    source: (r.source || "manual") as any,
    externalReference: r.external_reference ? String(r.external_reference) : null,
    occurredAt: String(r.occurred_at || new Date().toISOString()),
    reviewStatus: (r.review_status || "confirmed") as any,
    createdAt: String(r.client_created_at || r.created_at || new Date().toISOString()),
    updatedAt: String(r.client_updated_at || r.updated_at || new Date().toISOString()),
    deletedAt: r.deleted_at ? String(r.deleted_at) : null,
    syncStatus: "synced",
  };
}

async function pushOutbox(): Promise<{ pushed: number; failed: number }> {
  const entries = await db.syncOutbox
    .orderBy("createdAt")
    .limit(PUSH_BATCH_SIZE)
    .toArray();

  let pushed = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const payload = toRemoteRow(entry.payload as Partial<Transaction>);
      const { error } = await supabase
        .from("transactions")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        await markOutboxFailure(entry);
        failed += 1;
      } else {
        await markOutboxSynced(entry);
        pushed += 1;
      }
    } catch {
      await markOutboxFailure(entry);
      failed += 1;
    }
  }

  return { pushed, failed };
}

async function mergeRemoteTransaction(remote: Transaction): Promise<boolean> {
  const incoming: Transaction = {
    ...remote,
    description: remote.description ?? "",
    partyName: remote.partyName ?? null,
    externalReference: remote.externalReference ?? null,
    deletedAt: remote.deletedAt ?? null,
    reviewStatus: remote.reviewStatus ?? "confirmed",
    syncStatus: "synced",
  };

  const local = await db.transactions.get(incoming.id);

  if (!local) {
    await db.transactions.put(incoming);
    return true;
  }

  if (local.updatedAt > incoming.updatedAt) return false;

  if (
    local.updatedAt === incoming.updatedAt &&
    local.syncStatus !== "synced"
  ) {
    return false;
  }

  await db.transactions.put(incoming);
  return true;
}

async function pullRemoteChanges(): Promise<number> {
  const lastSync = (await db.syncState.get(LAST_SYNC_KEY))?.value;
  const syncStartedAt = new Date().toISOString();

  let pulled = 0;

  for (let offset = 0; ; offset += PULL_PAGE_SIZE) {
    let request = supabase
      .from("transactions")
      .select("*")
      .order("updated_at", { ascending: true })
      .range(offset, offset + PULL_PAGE_SIZE - 1);

    if (lastSync) {
      request = request.gt("updated_at", lastSync);
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    if (rows.length === 0) break;

    for (const rawRow of rows) {
      const row = fromRemoteRow(rawRow);
      if (await mergeRemoteTransaction(row)) {
        pulled += 1;
      }
    }

    if (rows.length < PULL_PAGE_SIZE) break;
  }

  await db.syncState.put({ key: LAST_SYNC_KEY, value: syncStartedAt });

  return pulled;
}

export async function syncNow(): Promise<SyncResult> {
  if (!isOnline()) {
    return { pushed: 0, pulled: 0, failed: 0, offline: true };
  }

  const result: SyncResult = {
    pushed: 0,
    pulled: 0,
    failed: 0,
    offline: false,
  };

  try {
    const { pushed, failed } = await pushOutbox();
    result.pushed = pushed;
    result.failed = failed;
    result.pulled = await pullRemoteChanges();
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : String(error);
  }

  return result;
}

export default syncNow;
