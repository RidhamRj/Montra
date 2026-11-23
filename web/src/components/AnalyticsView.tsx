import { useEffect, useMemo, useState } from "react";
import { PieChart, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useCategories } from "../hooks/useCategories";
import { getTransactions } from "../services/transactionService";
import type { Transaction } from "../types";
import { formatINR } from "../utils/formatters";

interface AnalyticsViewProps {
  userId: string;
}

type Period = "this-month" | "last-month" | "last-3-months" | "this-year";

const periods: { value: Period; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-year", label: "This year" },
];

function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "last-month":
      return {
        from: new Date(year, month - 1, 1),
        to: new Date(year, month, 1),
      };
    case "last-3-months":
      return {
        from: new Date(year, month - 2, 1),
        to: new Date(year, month + 1, 1),
      };
    case "this-year":
      return {
        from: new Date(year, 0, 1),
        to: new Date(year + 1, 0, 1),
      };
    case "this-month":
    default:
      return {
        from: new Date(year, month, 1),
        to: new Date(year, month + 1, 1),
      };
  }
}

export function AnalyticsView({ userId }: AnalyticsViewProps) {
  const { categories } = useCategories(userId);
  const [period, setPeriod] = useState<Period>("this-month");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { from, to } = getPeriodRange(period);
        const rows = await getTransactions(userId, {
          from: from.toISOString(),
          to: to.toISOString(),
        });
        if (!cancelled) setTransactions(rows);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load analytics",
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
  }, [userId, period]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const transaction of transactions) {
      if (transaction.type === "income") income += transaction.amount;
      else expense += transaction.amount;
    }

    return { income, expense, net: income - expense };
  }, [transactions]);

  const categorySpending = useMemo(() => {
    const totalsMap = new Map<string, number>();

    for (const transaction of transactions) {
      if (transaction.type !== "expense") continue;
      totalsMap.set(
        transaction.categoryId,
        (totalsMap.get(transaction.categoryId) ?? 0) + transaction.amount,
      );
    }

    return [...totalsMap.entries()]
      .map(([categoryId, amount]) => {
        const category = categoryById.get(categoryId);
        return {
          categoryId,
          name: category?.name ?? "Uncategorized",
          color: category?.color ?? "#94a3b8",
          amount,
          share: totals.expense > 0 ? amount / totals.expense : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, categoryById, totals.expense]);

  const chartMax = Math.max(totals.income, totals.expense, 1);
  const savingsRate =
    totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;
  const spentShare =
    totals.income > 0 ? Math.round((totals.expense / totals.income) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare income and understand where your money goes.
          </p>
        </div>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          {periods.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
          Loading analytics...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Income
                </p>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-600">
                {formatINR(totals.income)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Expenses
                </p>
                <TrendingDown className="h-4 w-4 text-rose-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-rose-600">
                {formatINR(totals.expense)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Net savings
                </p>
                <Wallet className="h-4 w-4 text-slate-500" />
              </div>
              <p
                className={`mt-2 text-2xl font-semibold tracking-tight ${
                  totals.net >= 0 ? "text-slate-900" : "text-rose-600"
                }`}
              >
                {formatINR(totals.net)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {totals.income > 0
                  ? `${savingsRate}% of income saved`
                  : "No income recorded"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Income vs expense
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {periods.find((option) => option.value === period)?.label}
                  </p>
                </div>
                <PieChart className="h-5 w-5 text-slate-400" />
              </div>

              {transactions.length === 0 ? (
                <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                  No transactions in this period.
                </p>
              ) : (
                <div className="mt-6 space-y-5">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">Income</span>
                      <span className="font-semibold text-emerald-600">
                        {formatINR(totals.income)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${
                            totals.income > 0
                              ? (totals.income / chartMax) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">
                        Expenses
                      </span>
                      <span className="font-semibold text-rose-600">
                        {formatINR(totals.expense)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{
                          width: `${
                            totals.expense > 0
                              ? (totals.expense / chartMax) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                    {totals.income > 0 ? (
                      <>
                        You spent{" "}
                        <span className="font-semibold text-slate-900">
                          {spentShare}%
                        </span>{" "}
                        of your income in this period.
                      </>
                    ) : (
                      "Add income entries to compare against your spending."
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Category spending
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Expense distribution
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  {formatINR(totals.expense)}
                </span>
              </div>

              {categorySpending.length === 0 ? (
                <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                  No expenses in this period.
                </p>
              ) : (
                <div className="mt-6 max-h-80 space-y-4 overflow-y-auto pr-1">
                  {categorySpending.map((item) => (
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
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {Math.round(item.share * 100)}%
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {formatINR(item.amount)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
        </>
      )}
    </div>
  );
}

export default AnalyticsView;
