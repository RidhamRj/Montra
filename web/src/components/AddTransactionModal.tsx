import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Loader2,
  Smartphone,
  X,
} from "lucide-react";
import { useCategories } from "../hooks/useCategories";
import { createTransaction } from "../services/transactionService";
import type {
  PaymentMethod,
  Transaction,
  TransactionType,
} from "../types";

interface AddTransactionModalProps {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCreated?: (transaction: Transaction) => void;
  initialType?: TransactionType;
}

const paymentOptions = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
] as const;

export function AddTransactionModal({
  open,
  userId,
  onClose,
  onCreated,
  initialType = "expense",
}: AddTransactionModalProps) {
  const { categories, loading: categoriesLoading } = useCategories(userId);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>(initialType);
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [partyName, setPartyName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );

  useEffect(() => {
    if (!open) return;

    setAmount("");
    setType(initialType);
    setCategoryId("");
    setPaymentMethod("cash");
    setPartyName("");
    setNotes("");
    setError(null);
    setSaving(false);
  }, [open, initialType]);

  useEffect(() => {
    if (!open) return;

    const valid = availableCategories.some(
      (category) => category.id === categoryId,
    );

    if (!valid) {
      setCategoryId(availableCategories[0]?.id ?? "");
    }
  }, [open, availableCategories, categoryId]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const paise = Math.round(Number(amount) * 100);

    if (!Number.isFinite(paise) || paise <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    if (!categoryId) {
      setError("Select a category.");
      return;
    }

    setSaving(true);

    try {
      const transaction = await createTransaction({
        userId,
        amount: paise,
        type,
        categoryId,
        description: notes.trim(),
        partyName: partyName.trim() || null,
        paymentMethod,
        source: "manual",
      });

      onCreated?.(transaction);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save transaction",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-transaction-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="add-transaction-title"
              className="text-base font-semibold text-slate-900"
            >
              Add transaction
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Recorded offline and synced when you are online.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                type === "expense"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ArrowDownRight className="h-4 w-4" />
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                type === "income"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              Income
            </button>
          </div>

          <div>
            <label
              htmlFor="transaction-amount"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">
                ₹
              </span>
              <input
                id="transaction-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                autoFocus
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-9 pr-4 text-lg font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-600">
              Category
            </span>
            {categoriesLoading ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Loading categories...
              </p>
            ) : availableCategories.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                No {type} categories available.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableCategories.map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryId(category.id)}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/20"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-600">
              Payment method
            </span>
            <div className="grid grid-cols-3 gap-2">
              {paymentOptions.map((option) => {
                const Icon = option.icon;
                const selected = paymentMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="transaction-party"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Merchant / party name
            </label>
            <input
              id="transaction-party"
              type="text"
              value={partyName}
              onChange={(event) => setPartyName(event.target.value)}
              maxLength={120}
              placeholder="e.g. Swiggy, Amazon, Landlord"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="transaction-notes"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Notes
            </label>
            <textarea
              id="transaction-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Optional details about this transaction"
              className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || categoriesLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? "Saving..."
                : `Add ${type === "expense" ? "expense" : "income"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTransactionModal;
