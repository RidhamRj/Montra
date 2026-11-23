import { db } from "../db/expenseDb";
import type {
  PaymentMethod,
  ReviewStatus,
  SyncAction,
  Transaction,
  TransactionSource,
  TransactionType,
} from "../types";

export interface CreateTransactionInput {
  userId: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  description?: string;
  partyName?: string | null;
  paymentMethod: PaymentMethod;
  source: TransactionSource;
  externalReference?: string | null;
  occurredAt?: string;
  reviewStatus?: ReviewStatus;
}

export type UpdateTransactionInput = Partial<
  Pick<
    Transaction,
    | "amount"
    | "type"
    | "categoryId"
    | "description"
    | "partyName"
    | "paymentMethod"
    | "source"
    | "externalReference"
    | "occurredAt"
    | "reviewStatus"
  >
>;

export interface TransactionQuery {
  type?: TransactionType;
  categoryId?: string;
  from?: string;
  to?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface MonthlySummary {
  income: number;
  expense: number;
  balance: number;
  transactionCount: number;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError("Transaction amount must be a positive integer in paise");
  }
}

async function enqueue(
  transaction: Transaction,
  action: SyncAction,
): Promise<void> {
  await db.syncOutbox.add({
    id: createId(),
    entityType: "transaction",
    entityId: transaction.id,
    action,
    payload: { ...transaction } as unknown as Record<string, unknown>,
    createdAt: nowIso(),
    attempts: 0,
  });
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  assertAmount(input.amount);

  const timestamp = nowIso();
  const transaction: Transaction = {
    id: createId(),
    userId: input.userId,
    amount: input.amount,
    type: input.type,
    categoryId: input.categoryId,
    description: input.description ?? "",
    partyName: input.partyName ?? null,
    paymentMethod: input.paymentMethod,
    source: input.source,
    externalReference: input.externalReference ?? null,
    occurredAt: input.occurredAt ?? timestamp,
    reviewStatus:
      input.reviewStatus ?? (input.source === "manual" ? "confirmed" : "pending"),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    syncStatus: "pending",
  };

  await db.transaction("rw", db.transactions, db.syncOutbox, async () => {
    await db.transactions.add(transaction);
    await enqueue(transaction, "insert");
  });

  return transaction;
}

export async function updateTransaction(
  id: string,
  patch: UpdateTransactionInput,
): Promise<Transaction> {
  return db.transaction("rw", db.transactions, db.syncOutbox, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }
    if (existing.deletedAt !== null) {
      throw new Error(`Transaction ${id} has been deleted`);
    }
    if (patch.amount !== undefined) {
      assertAmount(patch.amount);
    }

    const updated: Transaction = {
      ...existing,
      amount: patch.amount ?? existing.amount,
      type: patch.type ?? existing.type,
      categoryId: patch.categoryId ?? existing.categoryId,
      description: patch.description ?? existing.description,
      partyName:
        patch.partyName !== undefined ? patch.partyName : existing.partyName,
      paymentMethod: patch.paymentMethod ?? existing.paymentMethod,
      source: patch.source ?? existing.source,
      externalReference:
        patch.externalReference !== undefined
          ? patch.externalReference
          : existing.externalReference,
      occurredAt: patch.occurredAt ?? existing.occurredAt,
      reviewStatus: patch.reviewStatus ?? existing.reviewStatus,
      updatedAt: nowIso(),
      syncStatus: "pending",
    };

    await db.transactions.put(updated);
    await enqueue(updated, "update");
    return updated;
  });
}

export async function deleteTransaction(id: string): Promise<Transaction> {
  return db.transaction("rw", db.transactions, db.syncOutbox, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }
    if (existing.deletedAt !== null) {
      return existing;
    }

    const timestamp = nowIso();
    const deleted: Transaction = {
      ...existing,
      deletedAt: timestamp,
      updatedAt: timestamp,
      syncStatus: "pending",
    };

    await db.transactions.put(deleted);
    await enqueue(deleted, "delete");
    return deleted;
  });
}

export async function getTransactions(
  userId: string,
  query: TransactionQuery = {},
): Promise<Transaction[]> {
  const rows = await db.transactions.where("userId").equals(userId).toArray();

  const filtered = rows.filter((transaction) => {
    if (!query.includeDeleted && transaction.deletedAt !== null) return false;
    if (query.type && transaction.type !== query.type) return false;
    if (query.categoryId && transaction.categoryId !== query.categoryId) {
      return false;
    }
    if (query.from && transaction.occurredAt < query.from) return false;
    if (query.to && transaction.occurredAt >= query.to) return false;
    return true;
  });

  filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const offset = query.offset ?? 0;
  const end = query.limit ? offset + query.limit : undefined;
  return filtered.slice(offset, end);
}

export async function getPendingReviewTransactions(
  userId: string,
): Promise<Transaction[]> {
  const rows = await db.transactions
    .where("userId")
    .equals(userId)
    .filter(
      (transaction) =>
        transaction.reviewStatus === "pending" &&
        transaction.deletedAt === null,
    )
    .toArray();

  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

async function setReviewStatus(
  id: string,
  reviewStatus: ReviewStatus,
): Promise<Transaction> {
  return db.transaction("rw", db.transactions, db.syncOutbox, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }
    if (existing.deletedAt !== null) {
      throw new Error(`Transaction ${id} has been deleted`);
    }

    const updated: Transaction = {
      ...existing,
      reviewStatus,
      updatedAt: nowIso(),
      syncStatus: "pending",
    };

    await db.transactions.put(updated);
    await enqueue(updated, "update");
    return updated;
  });
}

export function confirmTransaction(id: string): Promise<Transaction> {
  return setReviewStatus(id, "confirmed");
}

export function rejectTransaction(id: string): Promise<Transaction> {
  return setReviewStatus(id, "rejected");
}

export async function getMonthlySummary(
  userId: string,
  year: number,
  month: number,
): Promise<MonthlySummary> {
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new RangeError("year and month must be integers");
  }
  if (month < 1 || month > 12) {
    throw new RangeError("month must be between 1 and 12");
  }

  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 1).toISOString();

  const rows = await db.transactions
    .where("[userId+occurredAt]")
    .between([userId, start], [userId, end], true, false)
    .filter((transaction) => transaction.deletedAt === null)
    .toArray();

  let income = 0;
  let expense = 0;

  for (const transaction of rows) {
    if (transaction.type === "income") {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
  }

  return {
    income,
    expense,
    balance: income - expense,
    transactionCount: rows.length,
  };
}
