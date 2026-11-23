import { useEffect, useState } from "react";
import {
  ensureDefaultCategories,
  getCategories,
} from "../services/categoryService";
import type { Category } from "../types";

export function useCategories(userId: string | undefined): {
  categories: Category[];
  loading: boolean;
} {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setCategories([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        await ensureDefaultCategories(userId);
        const rows = await getCategories();
        if (cancelled) return;

        const scoped = rows.filter((category) => category.userId === userId);
        const result = (scoped.length > 0 ? scoped : rows).sort(
          (a, b) =>
            a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
        );

        setCategories(result);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { categories, loading };
}
