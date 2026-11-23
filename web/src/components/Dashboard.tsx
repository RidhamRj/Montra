import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useCategories } from "../hooks/useCategories";
import {
  getMonthlySummary,
  getPendingReviewTransactions,
  getTransactions,
  type MonthlySummary,
} from "../services/transactionService";
import type { Transaction } from "../types";
import { formatDate, formatINR, formatMonthYear } from "../utils/formatters";

interface DashboardProps {
  userId: string;
  onReviewPending?: () => void;
  onViewAllTransactions?: () => void;
}

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "emerald" | "rose" | "slate";
}

const toneClasses = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/10",
  slate: "bg-slate-100 text-slate-700 ring-slate-600/10",
};

function SummaryCard({ label, value, hint, icon, tone }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${toneClasses[tone]}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

export function Dashboard({
  userId,
  onReviewPending,
  onViewAllTransactions,
}: DashboardProps) {
  const { categories } = useCategories(userId);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [pending, setPending] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const to = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          1,
        ).toISOString();

        const [monthSummary, currentMonth, recentTransactions, pendingReview] =
          await Promise.all([
            getMonthlySummary(userId, now.getFullYear(), now.getMonth() + 1),
            getTransactions(userId, { from, to }),
            getTransactions(userId, { limit: 6 }),
            getPendingReviewTransactions(userId),
          ]);

        if (cancelled) return;

        setSummary(monthSummary);
        setMonthTransactions(currentMonth);
        setRecent(recentTransactions);
        setPending(pendingReview);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load dashboard data",
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

  const methodTotals = useMemo(() => {
    const totals = { cash: 0, upi: 0, other: 0 };

    for (const transaction of monthTransactions) {
      if (transaction.type !== "expense") continue;
      if (transaction.paymentMethod === "cash") totals.cash += transaction.amount;
      else if (transaction.paymentMethod === "upi") totals.upi += transaction.amount;
      else totals.other += transaction.amount;
    }

    const total = totals.cash + totals.upi + totals.other;
    return { ...totals, total };
  }, [monthTransactions]);

  const breakdown = useMemo(() => {
    const totals = new Map<string, number>();

    for (const transaction of monthTransactions) {
      if (transaction.type !== "expense") continue;
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
      );
    }

    const total = [...totals.values()].reduce((sum, value) => sum + value, 0);

    return [...totals.entries()]
      .map(([categoryId, amount]) => {
        const category = categoryById.get(categoryId);
        return {
          categoryId,
          name: category?.name ?? "Uncategorized",
          color: category?.color ?? "#94a3b8",
          amount,
          share: total > 0 ? amount / total : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [monthTransactions, categoryById]);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const netBalance = summary?.balance ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatMonthYear(new Date())} overview
          </p>
        </div>
        {pending.length > 0 && (
          <p className="text-xs font-medium text-amber-700">
            {pending.length} transaction{pending.length === 1 ? "" : "s"} need
            review
          </p>
        )}
      </div>

      {pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Pending review
              </p>
              <p className="text-xs text-amber-700">
                Auto-detected UPI payments are waiting for your confirmation.
              </p>
            </div>
          </div>
          {onReviewPending && (
            <button
              type="button"
              onClick={onReviewPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
            >
              Review now
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total income"
          value={formatINR(summary?.income ?? 0)}
          hint="Money received this month"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="emerald"
        />
        <SummaryCard
          label="Total expenses"
          value={formatINR(summary?.expense ?? 0)}
          hint={`${summary?.transactionCount ?? 0} transactions`}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="rose"
        />
        <SummaryCard
          label="Net balance"
          value={formatINR(netBalance)}
          hint={netBalance >= 0 ? "You are in surplus" : "You are overspending"}
          icon={<Wallet className="h-5 w-5" />}
          tone={netBalance >= 0 ? "emerald" : "slate"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Cash vs UPI
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                This month&apos;s spending by payment method
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {formatINR(methodTotals.total)}
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {[
              {
                label: "Cash",
                amount: methodTotals.cash,
                icon: <Banknote className="h-4 w-4" />,
                color: "bg-emerald-500",
              },
              {
                label: "UPI",
                amount: methodTotals.upi,
                icon: <Smartphone className="h-4 w-4" />,
                color: "bg-indigo-500",
              },
              {
                label: "Card / other",
                amount: methodTotals.other,
                icon: <CreditCard className="h-4 w-4" />,
                color: "bg-slate-400",
              },
            ].map((method) => {
              const share =
                methodTotals.total > 0
                  ? Math.round((method.amount / methodTotals.total) * 100)
                  : 0;
              return (
                <div key={method.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                      {method.icon}
                      {method.label}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatINR(method.amount)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${method.color}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />
              Expenses
            </span>
            <span className="font-semibold text-slate-700">
              {formatINR(methodTotals.total)}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Category breakdown
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Where your money went this month
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {breakdown.length} categories
            </span>
          </div>

          {breakdown.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
              No expenses recorded this month.
            </p>
          ) : (
            <div className="mt-5 max-h-64 space-y-4 overflow-y-auto pr-1">
              {breakdown.map((item) => (
                <div key={item.categoryId}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate font-medium text-slate-700">
                        {item.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-900">
                      {formatINR(item.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(item.share * 100, 2)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Recent transactions
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Your latest activity
            </p>
          </div>
          {onViewAllTransactions && (
            <button
              type="button"
              onClick={onViewAllTransactions}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            No transactions yet. Add your first one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((transaction) => {
              const category = categoryById.get(transaction.categoryId);
              const isIncome = transaction.type === "income";
              return (
                <li
                  key={transaction.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-white"
                    style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                  >
                    {(category?.name ?? "U").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {transaction.partyName || category?.name || "Transaction"}
                    </p>
                    {transaction.description && (
                      <p className="truncate text-xs text-slate-600 font-mono">
                        {transaction.description}
                      </p>
                    )}
                    <p className="truncate text-[11px] text-slate-400">
                      {category?.name ?? "Uncategorized"} ·{" "}
                      {formatDate(transaction.occurredAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        isIncome ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatINR(transaction.amount)}
                    </span>
                    {isIncome ? (
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-rose-500" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
