import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useCategories } from "../hooks/useCategories";
import { getTransactions } from "../services/transactionService";
import type {
  PaymentMethod,
  Transaction,
  TransactionType,
} from "../types";
import { formatDate, formatINR } from "../utils/formatters";

interface TransactionListProps {
  userId: string;
  onAdd?: () => void;
}

type TypeFilter = "all" | TransactionType;

const paymentLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  other: "Other",
};

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function TransactionList({ userId, onAdd }: TransactionListProps) {
  const { categories } = useCategories(userId);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const rows = await getTransactions(userId);
        if (!cancelled) setTransactions(rows);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load transactions",
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
  }, [userId]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
      if (
        categoryFilter !== "all" &&
        transaction.categoryId !== categoryFilter
      ) {
        return false;
      }
      if (!term) return true;

      const categoryName = categoryById.get(transaction.categoryId)?.name ?? "";
      return [transaction.description, transaction.partyName ?? "", categoryName]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [transactions, search, typeFilter, categoryFilter, categoryById]);

  const visibleCategories = useMemo(
    () =>
      typeFilter === "all"
        ? categories
        : categories.filter((category) => category.type === typeFilter),
    [categories, typeFilter],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const transaction of filtered) {
      if (transaction.type === "income") income += transaction.amount;
      else expense += transaction.amount;
    }

    return { income, expense };
  }, [filtered]);

  function handleExport() {
    const rows: string[][] = [
      [
        "Date",
        "Type",
        "Category",
        "Description",
        "Party",
        "Payment method",
        "Source",
        "Amount (INR)",
        "Review status",
        "Sync status",
      ],
      ...filtered.map((transaction) => [
        transaction.occurredAt,
        transaction.type,
        categoryById.get(transaction.categoryId)?.name ?? "Uncategorized",
        transaction.description,
        transaction.partyName ?? "",
        paymentLabels[transaction.paymentMethod],
        transaction.source,
        (transaction.amount / 100).toFixed(2),
        transaction.reviewStatus,
        transaction.syncStatus,
      ]),
    ];

    downloadCsv(
      `transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Transactions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} of {transactions.length} transactions shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search merchant, note or category..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>

          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value as TypeFilter);
              setCategoryFilter("all");
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All categories</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            Income{" "}
            <span className="font-semibold text-emerald-600">
              {formatINR(totals.income)}
            </span>
          </span>
          <span className="h-3 w-px bg-slate-200" />
          <span>
            Expenses{" "}
            <span className="font-semibold text-rose-600">
              {formatINR(totals.expense)}
            </span>
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Loading transactions...
          </p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <ShoppingBag className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-slate-700">
              {transactions.length === 0
                ? "No transactions yet"
                : "No matching transactions"}
            </p>
            <p className="max-w-sm text-xs text-slate-500">
              {transactions.length === 0
                ? "Add your first expense or income entry to start tracking."
                : "Try changing your search term or filters."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((transaction) => {
              const category = categoryById.get(transaction.categoryId);
              const isIncome = transaction.type === "income";
              return (
                <li
                  key={transaction.id}
                  className="flex items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold text-white"
                    style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                  >
                    {(category?.name ?? "U").charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {transaction.partyName ||
                          transaction.description ||
                          category?.name ||
                          "Transaction"}
                      </p>
                      {transaction.reviewStatus === "pending" && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          Pending
                        </span>
                      )}
                      {transaction.reviewStatus === "rejected" && (
                        <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                          Rejected
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {category?.name ?? "Uncategorized"} ·{" "}
                      {paymentLabels[transaction.paymentMethod]} ·{" "}
                      {formatDate(transaction.occurredAt)}
                      {transaction.syncStatus !== "synced" && (
                        <span className="text-amber-600"> · Not synced</span>
                      )}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      isIncome ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {isIncome ? "+" : "-"}
                    {formatINR(transaction.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TransactionList;
