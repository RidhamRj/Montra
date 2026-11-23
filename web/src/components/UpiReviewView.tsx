import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useCategories } from "../hooks/useCategories";
import {
  confirmTransaction,
  getPendingReviewTransactions,
  rejectTransaction,
} from "../services/transactionService";
import type { Transaction, TransactionSource } from "../types";
import { formatDate, formatINR } from "../utils/formatters";

interface UpiReviewViewProps {
  userId: string;
  onReviewed?: () => void;
}

const sourceLabels: Record<TransactionSource, string> = {
  manual: "Manual",
  phonepe: "PhonePe",
  gpay: "Google Pay",
  paytm: "Paytm",
  bank: "Bank",
};

export function UpiReviewView({ userId, onReviewed }: UpiReviewViewProps) {
  const { categories } = useCategories(userId);
  const [pending, setPending] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const rows = await getPendingReviewTransactions(userId);
        if (!cancelled) setPending(rows);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load pending transactions",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  async function handleAction(id: string, action: "confirm" | "reject") {
    setBusyId(id);
    setError(null);

    try {
      if (action === "confirm") {
        await confirmTransaction(id);
      } else {
        await rejectTransaction(id);
      }

      setPending((current) =>
        current.filter((transaction) => transaction.id !== id),
      );
      onReviewed?.();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update transaction",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            UPI Review
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {pending.length} transaction{pending.length === 1 ? "" : "s"} waiting
            for confirmation
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-xs font-medium text-indigo-900">
          Auto-detected UPI payments stay in review until you confirm or reject
          them.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
          Loading pending transactions...
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ClipboardCheck className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-slate-800">
            You are all caught up
          </p>
          <p className="max-w-sm text-xs text-slate-500">
            There are no pending UPI transactions to review right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((transaction) => {
            const category = categoryById.get(transaction.categoryId);
            const isIncome = transaction.type === "income";
            const busy = busyId === transaction.id;

            return (
              <li
                key={transaction.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                    >
                      {(category?.name ?? "U").charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {transaction.partyName ||
                            transaction.description ||
                            "UPI transaction"}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {sourceLabels[transaction.source]}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {category?.name ?? "Uncategorized"} ·{" "}
                        {formatDate(transaction.occurredAt)} ·{" "}
                        {transaction.paymentMethod.toUpperCase()}
                      </p>

                      {transaction.partyName && transaction.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {transaction.description}
                        </p>
                      )}

                      {transaction.externalReference && (
                        <p className="mt-1 break-all text-[10px] font-mono text-slate-400">
                          Ref: {transaction.externalReference}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <span
                      className={`text-base font-semibold ${
                        isIncome ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatINR(transaction.amount)}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(transaction.id, "reject")}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(transaction.id, "confirm")}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Confirm
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default UpiReviewView;
