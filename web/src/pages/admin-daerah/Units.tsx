import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { request } from "../../api/client";
import { logger } from "../../lib/logger";

interface Unit {
  id: string;
  nama: string;
  wilayah_id: string;
  wilayah_nama: string;
  alamat: string | null;
  kontak: string | null;
  is_active: boolean;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

interface UnitsApiResponse {
  data: Unit[];
  pagination: Pagination;
}

interface WilayahOption {
  id: string;
  name: string;
}

interface UnitFormData {
  nama: string;
  wilayah_id: string;
  alamat: string;
  kontak: string;
}

interface FormErrors {
  nama?: string;
  wilayah_id?: string;
}

const validateForm = (data: UnitFormData): FormErrors => {
  const errors: FormErrors = {};
  if (!data.nama.trim()) {
    errors.nama = "Nama unit wajib diisi";
  } else if (data.nama.trim().length < 3) {
    errors.nama = "Nama minimal 3 karakter";
  }
  if (!data.wilayah_id) {
    errors.wilayah_id = "Wilayah wajib dipilih";
  }
  return errors;
};

interface DeleteModalProps {
  unit: Unit;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const DeleteConfirmModal = ({ unit, onConfirm, onCancel, isDeleting }: DeleteModalProps) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-sm mx-4">
      <h3 className="text-lg font-semibold mb-2">Hapus Unit</h3>
      <p className="text-sm text-sigap-textSecondary mb-4">
        Apakah Anda yakin ingin menghapus unit <strong>{unit.nama}</strong>?
        <span className="block mt-1 text-xs text-sigap-textMuted">Aksi ini tidak dapat dibatalkan.</span>
      </p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="px-4 py-2 bg-danger-500 text-white text-sm font-medium rounded hover:bg-danger-600 disabled:opacity-50"
        >
          {isDeleting ? "Menghapus..." : "Hapus"}
        </button>
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="px-4 py-2 border border-sigap-border text-sm font-medium rounded hover:bg-sigap-background disabled:opacity-50"
        >
          Batal
        </button>
      </div>
    </div>
  </div>
);

interface UnitFormModalProps {
  unit?: Unit | null;
  wilayahOptions: WilayahOption[];
  onSubmit: (data: UnitFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

const UnitFormModal = ({
  unit,
  wilayahOptions,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
}: UnitFormModalProps) => {
  const [formData, setFormData] = useState<UnitFormData>({
    nama: unit?.nama ?? "",
    wilayah_id: unit?.wilayah_id ?? "",
    alamat: unit?.alamat ?? "",
    kontak: unit?.kontak ?? "",
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    await onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {unit ? "Edit Unit" : "Tambah Unit"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nama Unit *</label>
            <input
              type="text"
              name="nama"
              value={formData.nama}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded text-sm bg-sigap-background ${
                formErrors.nama ? "border-danger-500" : "border-sigap-border"
              }`}
              placeholder="Contoh: Unit Penanganan Cepat"
            />
              {formErrors.nama && (
              <p className="text-xs text-danger-500 mt-1">{formErrors.nama}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Wilayah *</label>
            <select
              name="wilayah_id"
              value={formData.wilayah_id}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded text-sm bg-sigap-background ${
                formErrors.wilayah_id ? "border-danger-500" : "border-sigap-border"
              }`}
            >
              <option value="">-- Pilih Wilayah --</option>
              {wilayahOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
              {formErrors.wilayah_id && (
              <p className="text-xs text-danger-500 mt-1">{formErrors.wilayah_id}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Alamat <span className="text-sigap-textMuted font-normal">(opsional)</span>
            </label>
            <textarea
              name="alamat"
              value={formData.alamat}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-sigap-border rounded text-sm bg-sigap-background resize-none"
              placeholder="Alamat kantor/unit"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Kontak <span className="text-sigap-textMuted font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              name="kontak"
              value={formData.kontak}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-sigap-border rounded text-sm bg-sigap-background"
              placeholder="Nomor telepon atau email"
            />
          </div>

          {submitError && (
            <p className="text-sm text-danger-500">{submitError}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-sigap-primary text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 border border-sigap-border text-sm font-medium rounded hover:bg-sigap-background disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminDaerahUnits = () => {
  const user = useAuthStore((s) => s.user);

  const [units, setUnits] = useState<Unit[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [wilayahOptions, setWilayahOptions] = useState<WilayahOption[]>([]);
  const [loadingWilayah, setLoadingWilayah] = useState(false);

  const fetchUnits = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await request<UnitsApiResponse>(
        `/admin-daerah/units?page=${page}&limit=10`,
        { token: true }
      );
      setUnits(data.data);
      setPagination(data.pagination);
    } catch (err) {
      logger.error("Failed to fetch units", { error: err });
      setError("Gagal memuat daftar unit. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const fetchWilayahOptions = async () => {
    setLoadingWilayah(true);
    try {
      const data = await request<{ wilayah: Array<{ id: string; name: string }> }>(
        "/wilayah",
        { token: true }
      );
      setWilayahOptions(data.wilayah.map((w) => ({ id: w.id, name: w.name })));
    } catch (err) {
      logger.error("Failed to fetch wilayah options", { error: err });
    } finally {
      setLoadingWilayah(false);
    }
  };

  useEffect(() => {
    fetchUnits();
    fetchWilayahOptions();
  }, []);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      fetchUnits(newPage);
    }
  };

  const openCreateForm = () => {
    setEditingUnit(null);
    setSubmitError(null);
    setShowForm(true);
  };

  const openEditForm = (unit: Unit) => {
    setEditingUnit(unit);
    setSubmitError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingUnit(null);
    setSubmitError(null);
  };

  const handleSubmit = async (formData: UnitFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (editingUnit) {
        await request<Unit>(`/admin-daerah/units/${editingUnit.id}`, {
          method: "PUT",
          body: JSON.stringify(formData),
          token: true,
        });
      } else {
        await request<Unit>("/admin-daerah/units", {
          method: "POST",
          body: JSON.stringify(formData),
          token: true,
        });
      }
      fetchUnits(pagination.page);
      closeForm();
    } catch (err) {
      logger.error("Failed to save unit", { error: err });
      setSubmitError(err instanceof Error ? err.message : "Gagal menyimpan unit");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUnit) return;
    setIsDeleting(true);
    try {
      await request<{ success: boolean }>(`/admin-daerah/units/${deleteUnit.id}`, {
        method: "DELETE",
        token: true,
      });
      setDeleteUnit(null);
      fetchUnits(pagination.page);
    } catch (err) {
      logger.error("Failed to delete unit", { error: err });
      alert(err instanceof Error ? err.message : "Gagal menghapus unit");
    } finally {
      setIsDeleting(false);
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
            <h2 className="text-lg font-semibold">Manajemen Unit</h2>
            <p className="text-xs text-sigap-textMuted">
              Kelola unit penanganan di wilayah Anda
            </p>
          </div>
          <button
            onClick={openCreateForm}
            className="px-4 py-2 bg-sigap-primary text-white text-sm font-medium rounded hover:opacity-90"
          >
            + Tambah Unit
          </button>
        </div>

        {showForm && (
          <UnitFormModal
            unit={editingUnit}
            wilayahOptions={wilayahOptions}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            isSubmitting={isSubmitting}
            submitError={submitError}
          />
        )}

        {deleteUnit && (
          <DeleteConfirmModal
            unit={deleteUnit}
            onConfirm={handleDelete}
            onCancel={() => setDeleteUnit(null)}
            isDeleting={isDeleting}
          />
        )}

        <div className="bg-sigap-surface rounded-lg border border-sigap-border">
          {loading && (
            <div className="p-8 text-center">
              <div className="inline-block w-6 h-6 border-2 border-sigap-border border-t-sigap-primary rounded-full animate-spin" />
              <p className="text-sigap-textMuted text-sm mt-2">Memuat...</p>
            </div>
          )}

          {!loading && error && (
            <div className="p-4">
              <div className="p-4 rounded bg-danger-100 border border-danger-200 text-sm text-danger-500 flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={() => fetchUnits(pagination.page)}
                  className="text-xs underline hover:no-underline"
                >
                  Coba lagi
                </button>
              </div>
            </div>
          )}

          {!loading && !error && units.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sigap-textMuted">Belum ada data unit.</p>
              <button
                onClick={openCreateForm}
                className="mt-2 text-sm text-sigap-primary hover:underline"
              >
                Tambah unit pertama
              </button>
            </div>
          )}

          {!loading && !error && units.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sigap-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-sigap-textMuted uppercase tracking-wide">
                        Nama Unit
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sigap-textMuted uppercase tracking-wide">
                        Wilayah
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sigap-textMuted uppercase tracking-wide">
                        Alamat
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sigap-textMuted uppercase tracking-wide">
                        Kontak
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-sigap-textMuted uppercase tracking-wide">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-sigap-textMuted uppercase tracking-wide">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit) => (
                      <tr
                        key={unit.id}
                        className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50"
                      >
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-sigap-textPrimary">
                            {unit.nama}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-sigap-textSecondary">
                            {unit.wilayah_nama}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-sigap-textSecondary">
                            {unit.alamat ?? "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-sigap-textSecondary">
                            {unit.kontak ?? "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              unit.is_active
                                ? "bg-selesai-100 text-selesai-700"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {unit.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => openEditForm(unit)}
                              className="text-xs text-sigap-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteUnit(unit)}
                              className="text-xs text-danger-500 hover:underline"
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

              {pagination.total_pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-sigap-border">
                  <p className="text-xs text-sigap-textMuted">
                    Menampilkan {((pagination.page - 1) * pagination.limit) + 1}–
                    {Math.min(pagination.page * pagination.limit, pagination.total)} dari{" "}
                    {pagination.total} unit
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="px-3 py-1 text-xs border border-sigap-border rounded hover:bg-sigap-background disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    {Array.from({ length: pagination.total_pages }, (_, i) => i + 1)
                      .filter((page) => {
                        const distance = Math.abs(page - pagination.page);
                        return distance <= 2 || page === 1 || page === pagination.total_pages;
                      })
                      .map((page, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showEllipsis = prev && page - prev > 1;
                        return (
                          <span key={page}>
                            {showEllipsis && (
                              <span className="px-2 text-xs text-sigap-textMuted">...</span>
                            )}
                            <button
                              onClick={() => handlePageChange(page)}
                              className={`px-3 py-1 text-xs border rounded ${
                                page === pagination.page
                                  ? "bg-sigap-primary text-white border-sigap-primary"
                                  : "border-sigap-border hover:bg-sigap-background"
                              }`}
                            >
                              {page}
                            </button>
                          </span>
                        );
                      })}
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.total_pages}
                      className="px-3 py-1 text-xs border border-sigap-border rounded hover:bg-sigap-background disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
