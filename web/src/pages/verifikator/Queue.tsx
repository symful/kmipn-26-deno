import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Category } from "../../types";
import { StatusBadge } from "../../components/StatusBadge";
import { logger } from "@/lib/logger";

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "verified", label: "Verified" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "needs_survey", label: "Needs Survey" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface QueueItem {
  id: string;
  category_id: string;
  description: string;
  lng: number;
  lat: number;
  status: string;
  severity: number | null;
  photo_urls: string[];
  created_at: string;
}

export default function Queue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: { status?: string; kategori?: string; page: number; limit: number } = {
      page,
      limit,
    };
    if (statusFilter) params.status = statusFilter;
    if (kategoriFilter) params.kategori = kategoriFilter;

    api.verifikatorQueue(params)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error("Failed to fetch verifikator queue", { error: err });
        setError(err instanceof Error ? err.message : "Gagal memuat antrian");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, kategoriFilter, page, limit]);

  useEffect(() => {
    api.categories()
      .then((data) => setCategories(data.categories ?? []))
      .catch((e) => {
        logger.error("Failed to fetch categories", { error: e });
        setCategoriesError("Gagal memuat kategori");
        setCategories([]);
      });
  }, []);

  const handleRetryCategories = () => {
    setCategoriesError(null);
    api.categories()
      .then((data) => setCategories(data.categories ?? []))
      .catch((e) => {
        logger.error("Failed to fetch categories", { error: e });
        setCategoriesError("Gagal memuat kategori");
        setCategories([]);
      });
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleKategoriChange = (val: string) => {
    setKategoriFilter(val);
    setPage(1);
  };

  const handleLimitChange = (val: number) => {
    setLimit(val);
    setPage(1);
  };

  const handleRetry = () => {
    setPage(1);
    setError(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Antrean Verifikasi</h1>

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kategori</label>
          {categoriesError ? (
            <div className="flex items-center gap-2">
              <span className="text-red-600 text-xs">{categoriesError}</span>
              <button
                onClick={handleRetryCategories}
                className="text-xs text-blue-600 hover:underline"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <select
              value={kategoriFilter}
              onChange={(e) => handleKategoriChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-end">
          <span className="text-sm text-gray-500 px-2 py-2">
            {total} total
          </span>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-red-700 text-sm mb-3">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">Tidak ada data</p>
          <p className="text-sm">Coba ubah filter atau tambah data baru</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="space-y-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">{it.id.slice(0, 8)}</span>
                      <StatusBadge status={it.status} />
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-2 mb-1">
                      {it.description.slice(0, 120)}
                      {it.description.length > 120 ? "..." : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(it.created_at).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {it.severity != null && (
                      <span className="text-xs font-medium px-2 py-1 bg-gray-100 rounded">
                        Severity: {it.severity}%
                      </span>
                    )}
                    <Link
                      to={`/verifikator/cases/${it.id}`}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Per halaman:</span>
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-600">
                  Halaman {page} dari {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
