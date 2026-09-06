import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Category } from "../types";
import { logger } from "@/lib/logger";

interface CategoryOption {
  value: string;
  label: string;
}

export function useCategoryOptions() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [rawCategories, setRawCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await api.publicCategories();
      setRawCategories(raw);
      setCategories([
        { value: "", label: "Semua Kategori" },
        ...raw.map((cat) => ({ value: cat.id, label: cat.name })),
      ]);
    } catch (e) {
      logger.error("Failed to fetch categories", { error: e });
      setError("Gagal memuat kategori");
      setRawCategories([]);
      setCategories([{ value: "", label: "Semua Kategori" }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    rawCategories,
    loading,
    error,
    refetch: fetchCategories,
  };
}
