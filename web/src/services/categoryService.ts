import { db } from "../db/expenseDb";
import type { Category } from "../types";

export const DEFAULT_CATEGORIES: Omit<Category, "userId">[] = [
  { id: "cat-food", name: "Food & Dining", type: "expense", icon: "Utensils", color: "#f97316", isDefault: true },
  { id: "cat-groceries", name: "Groceries", type: "expense", icon: "ShoppingCart", color: "#10b981", isDefault: true },
  { id: "cat-transport", name: "Transportation", type: "expense", icon: "Car", color: "#3b82f6", isDefault: true },
  { id: "cat-shopping", name: "Shopping", type: "expense", icon: "ShoppingBag", color: "#ec4899", isDefault: true },
  { id: "cat-bills", name: "Bills & Utilities", type: "expense", icon: "Receipt", color: "#8b5cf6", isDefault: true },
  { id: "cat-entertainment", name: "Entertainment", type: "expense", icon: "Film", color: "#eab308", isDefault: true },
  { id: "cat-healthcare", name: "Healthcare", type: "expense", icon: "HeartPulse", color: "#ef4444", isDefault: true },
  { id: "cat-salary", name: "Salary", type: "income", icon: "Briefcase", color: "#10b981", isDefault: true },
  { id: "cat-freelance", name: "Freelance / Business", type: "income", icon: "TrendingUp", color: "#06b6d4", isDefault: true },
  { id: "cat-gift", name: "Cash Gift / Received", type: "income", icon: "Gift", color: "#84cc16", isDefault: true },
  { id: "cat-other-exp", name: "Other Expense", type: "expense", icon: "MinusCircle", color: "#64748b", isDefault: true },
  { id: "cat-other-inc", name: "Other Income", type: "income", icon: "PlusCircle", color: "#64748b", isDefault: true },
];

export async function ensureDefaultCategories(userId: string = "local-user"): Promise<Category[]> {
  const count = await db.categories.count();
  if (count === 0) {
    const toInsert: Category[] = DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      userId,
    }));
    await db.categories.bulkPut(toInsert);
    return toInsert;
  }
  return db.categories.toArray();
}

export async function getCategories(type?: "expense" | "income"): Promise<Category[]> {
  if (type) {
    return db.categories.where("type").equals(type).toArray();
  }
  return db.categories.toArray();
}

