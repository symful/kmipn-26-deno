import { useEffect, useState, useCallback } from "react";
import { request, api } from "../../api/client";
import type { Category } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { logger } from "@/lib/logger";

type Prioritas = "rendah" | "sedang" | "tinggi" | "kritis";

interface SlaRule {
  id: string;
  kategori_id: string;
  kategori_nama: string;
  prioritas: Prioritas;
  jam: number;
  is_active: boolean;
  created_at: string;
}

interface SlaFormData {
  kategori_id: string;
  prioritas: Prioritas;
  jam: number;
  is_active: boolean;
}

interface SlaResponse {
  data: SlaRule[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

const PRIORITAS_OPTIONS: { value: Prioritas; label: string }[] = [
  { value: "rendah", label: "Rendah" },
  { value: "sedang", label: "Sedang" },
  { value: "tinggi", label: "Tinggi" },
  { value: "kritis", label: "Kritis" },
];

const PRIORITAS_COLORS: Record<Prioritas, string> = {
  rendah: "bg-green-100 text-green-700",
  sedang: "bg-yellow-100 text-yellow-700",
  tinggi: "bg-orange-100 text-orange-700",
  kritis: "bg-red-100 text-red-700",
};

const emptyForm: SlaFormData = {
  kategori_id: "",
  prioritas: "sedang",
  jam: 24,
  is_active: true,
};

const formDefaults = (f: SlaFormData) => ({
  ...f,
  kategori_id: f.kategori_id || "",
  prioritas: f.prioritas || "sedang" as Prioritas,
  jam: f.jam || 24,
  is_active: f.is_active !== undefined ? f.is_active : true,
});

export const AdminDaerahSla = () => {
  const user = useAuthStore((s) => s.user);

  const [rules, setRules] = useState<SlaRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);

  const [categories, setCategories] = useState<Category[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<SlaRule | null>(null);
  const [formData, setFormData] = useState<SlaFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<{ general?: string; kategori_id?: string; prioritas?: string; jam?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SlaRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRules = useCallback(() => {
    setLoading(true);
    setError(null);
    request<SlaResponse>(`/admin-daerah/sla?page=${page}&limit=${limit}`, { token: true })
      .then((res) => {
        setRules(res.data);
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.total_pages);
      })
      .catch((e) => {
        logger.error("Failed to fetch SLA rules", { error: e });
        setError("Gagal memuat aturan SLA");
      })
      .finally(() => setLoading(false));
  }, [page, limit]);

  const loadCategories = useCallback(() => {
    api
      .categories()
      .then((data) => setCategories(data.categories))
      .catch((e) => logger.error("Failed to fetch categories", { error: e }));
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreateModal = () => {
    setEditingRule(null);
    setFormData(emptyForm);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (rule: SlaRule) => {
    setEditingRule(rule);
    setFormData({
      kategori_id: rule.kategori_id,
      prioritas: rule.prioritas,
      jam: rule.jam,
      is_active: rule.is_active,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRule(null);
    setFormData(emptyForm);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: typeof formErrors = {};
    if (!formData.kategori_id) {
      errors.kategori_id = "Kategori wajib dipilih";
    }
    if (!formData.prioritas) {
      errors.prioritas = "Prioritas wajib dipilih";
    }
    if (!formData.jam || formData.jam <= 0) {
      errors.jam = "Jam SLA harus lebih dari 0";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setFormErrors({});

    const body = {
      kategori_id: formData.kategori_id,
      prioritas: formData.prioritas,
      jam: Number(formData.jam),
      is_active: formData.is_active,
    };

    try {
      if (editingRule) {
        const previous = rules;
        setRules((prev) =>
          prev.map((r) =>
            r.id === editingRule.id
              ? {
                  ...r,
                  kategori_id: body.kategori_id,
                  kategori_nama: categories.find((c) => c.id === body.kategori_id)?.name ?? r.kategori_nama,
                  prioritas: body.prioritas,
                  jam: body.jam,
                  is_active: body.is_active,
                }
              : r
          )
        );
        try {
          await request<SlaRule>(`/admin-daerah/sla/${editingRule.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
            token: true,
          });
        } catch (err) {
          setRules(previous);
          throw err;
        }
      } else {
        const tempId = `temp-${Date.now()}`;
        const tempRule: SlaRule = {
          id: tempId,
          ...body,
          kategori_nama: categories.find((c) => c.id === body.kategori_id)?.name ?? "",
          created_at: new Date().toISOString(),
        };
        setRules((prev) => [...prev, tempRule]);
        try {
          const created = await request<SlaRule>("/admin-daerah/sla", {
            method: "POST",
            body: JSON.stringify(body),
            token: true,
          });
          setRules((prev) => prev.map((r) => (r.id === tempId ? created : r)));
        } catch (err) {
          setRules((prev) => prev.filter((r) => r.id !== tempId));
          throw err;
        }
      }
      closeModal();
    } catch (err: unknown) {
      logger.error("Failed to save SLA rule", { error: err });
      const msg = err instanceof Error ? err.message : "Gagal menyimpan aturan SLA";
      setFormErrors({ general: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const previous = rules;
    setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    try {
      await request<void>(`/admin-daerah/sla/${deleteTarget.id}`, {
        method: "DELETE",
        token: true,
      });
      setDeleteTarget(null);
    } catch (err: unknown) {
      logger.error("Failed to delete SLA rule", { error: err });
      setRules(previous);
      const msg = err instanceof Error ? err.message : "Gagal menghapus aturan SLA";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SIGAP Admin Daerah</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Konfigurasi SLA</h2>
            <p className="text-sm text-sigap-textMuted">{total} aturan SLA</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: colors.primary }}
          >
            <span>+</span> Tambah SLA
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded bg-danger-100 border border-danger-200 text-sm text-danger-500 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => {
                setError(null);
                loadRules();
              }}
              className="font-bold ml-4 hover:underline"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {loading ? (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-12 text-center">
            <div
              className="inline-block w-6 h-6 border-2 border-sigap-border border-t-sigap-primary rounded-full animate-spin"
              style={{ borderTopColor: colors.primary }}
            />
            <p className="text-sm text-sigap-textMuted mt-3">Memuat...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-12 text-center">
            <p className="text-sigap-textMuted">Belum ada aturan SLA.</p>
            <p className="text-sm text-sigap-textMuted mt-1">
              Klik "Tambah SLA" untuk membuat aturan baru.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-sigap-surface rounded-lg border border-sigap-border overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sigap-background border-b border-sigap-border">
                    <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Kategori</th>
                    <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Prioritas</th>
                    <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">SLA</th>
                    <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => (
                    <tr
                      key={rule.id}
                      className={`border-b border-sigap-border last:border-0 hover:bg-sigap-background/50`}
                    >
                      <td className="px-4 py-3 font-medium">{rule.kategori_nama}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            PRIORITAS_COLORS[rule.prioritas] ?? "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {rule.prioritas.charAt(0).toUpperCase() + rule.prioritas.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono">{rule.jam}</span> jam
                      </td>
                      <td className="px-4 py-3">
                        {rule.is_active ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-selesai-100 text-selesai-700">
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-500">
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEditModal(rule)}
                            className="text-xs font-medium text-sigap-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(rule)}
                            className="text-xs font-medium text-red-500 hover:underline"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-sigap-textMuted">
                  Halaman {page} dari {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 rounded text-sm border border-sigap-border hover:bg-sigap-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 rounded text-sm border border-sigap-border hover:bg-sigap-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sigap-surface rounded-xl border border-sigap-border shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border sticky top-0 bg-sigap-surface">
              <h3 className="font-semibold">
                {editingRule ? "Edit Aturan SLA" : "Tambah Aturan SLA"}
              </h3>
              <button
                onClick={closeModal}
                className="text-sigap-textMuted hover:text-sigap-text transition-colors text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.general && (
                <div className="p-3 rounded bg-danger-100 border border-danger-200 text-sm text-danger-500">
                  {formErrors.general}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Kategori <span className="text-danger-500">*</span>
                </label>
                <select
                  value={formData.kategori_id}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, kategori_id: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                >
                  <option value="">Pilih Kategori</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {formErrors.kategori_id && (
                  <p className="text-xs text-danger-500">{formErrors.kategori_id}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Prioritas <span className="text-danger-500">*</span>
                </label>
                <select
                  value={formData.prioritas}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      prioritas: e.target.value as Prioritas,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                >
                  {PRIORITAS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {formErrors.prioritas && (
                  <p className="text-xs text-danger-500">{formErrors.prioritas}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  SLA (jam) <span className="text-danger-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.jam}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, jam: Number(e.target.value) }))
                  }
                  placeholder="Contoh: 24"
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                />
                {formErrors.jam && <p className="text-xs text-danger-500">{formErrors.jam}</p>}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-sigap-border text-sigap-primary focus:ring-sigap-primary/40"
                />
                <label htmlFor="is_active" className="text-sm text-sigap-textMuted">
                  Aktifkan aturan SLA ini
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-sigap-border hover:bg-sigap-background transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: colors.primary }}
                >
                  {submitting
                    ? "Menyimpan..."
                    : editingRule
                    ? "Simpan"
                    : "Buat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sigap-surface rounded-xl border border-sigap-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="font-semibold text-lg mb-2">Hapus Aturan SLA?</h3>
              <p className="text-sm text-sigap-textMuted mb-6">
                Apakah Anda yakin ingin menghapus aturan SLA untuk{" "}
                <strong className="text-sigap-text">{deleteTarget.kategori_nama}</strong>{" "}
                dengan prioritas{" "}
                <strong className="text-sigap-text">{deleteTarget.prioritas}</strong>?<br />
                Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-sigap-border hover:bg-sigap-background transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-danger-500 hover:bg-danger-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
