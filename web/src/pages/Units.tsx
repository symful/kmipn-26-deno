import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth";
import { colors } from "../theme/tokens";
import { api, request } from "../api/client";
import { logger } from "../lib/logger";
import { toast } from "@/components/Toast";
import type { Unit, Pagination } from "../types";

import { SigapCard } from "../components/design-system/Card";

interface UnitFormData {
  nama: string;
  alamat: string;
  kontak: string;
}

interface FormErrors {
  nama?: string;
}

const validateForm = (data: UnitFormData): FormErrors => {
  const errors: FormErrors = {};
  if (!data.nama.trim()) {
    errors.nama = "Nama unit wajib diisi";
  } else if (data.nama.trim().length < 3) {
    errors.nama = "Nama minimal 3 karakter";
  }
  return errors;
};

interface DeleteModalProps {
  unit: Unit;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const DeleteConfirmModal = ({
  unit,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteModalProps) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl border border-sigap-border p-6 w-full max-w-sm shadow-xl">
      <h3 className="text-base font-bold text-sigap-textPrimary mb-2">
        Hapus Unit Kerja
      </h3>
      <p className="text-xs text-sigap-textSecondary mb-4">
        Apakah Anda yakin ingin menghapus unit{" "}
        <strong className="text-sigap-textPrimary">{unit.nama}</strong>?
        Tindakan ini tidak dapat dibatalkan.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="px-4 py-2 text-xs font-semibold rounded-lg border border-sigap-border hover:bg-sigap-background disabled:opacity-50 transition-colors"
        >
          Batal
        </button>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: colors.danger }}
        >
          {isDeleting ? "Menghapus..." : "Hapus Unit"}
        </button>
      </div>
    </div>
  </div>
);

interface UnitFormModalProps {
  unit: Unit | null;
  onSubmit: (data: UnitFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

const UnitFormModal = ({
  unit,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
}: UnitFormModalProps) => {
  const [formData, setFormData] = useState<UnitFormData>({
    nama: unit?.nama ?? "",
    alamat: unit?.alamat ?? "",
    kontak: unit?.kontak ?? "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-sigap-border p-6 w-full max-w-md shadow-xl">
        <h3 className="text-base font-bold text-sigap-textPrimary mb-4">
          {unit ? "Edit Unit Kerja" : "Tambah Unit Kerja Baru"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-sigap-textSecondary mb-1.5">
              Nama Unit <span style={{ color: colors.danger }}>*</span>
            </label>
            <input
              type="text"
              name="nama"
              value={formData.nama}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-sigap-background focus:outline-none focus:ring-2 focus:ring-sigap-primary/20"
              style={{
                borderColor: errors.nama ? colors.danger : colors.borderCard,
              }}
              placeholder="Contoh: Dinas PUPR Wilayah 1"
            />
            {errors.nama && (
              <p className="text-xs mt-1" style={{ color: colors.danger }}>
                {errors.nama}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sigap-textSecondary mb-1.5">
              Alamat Kantor{" "}
              <span className="text-sigap-textMuted font-normal">
                (opsional)
              </span>
            </label>
            <textarea
              name="alamat"
              value={formData.alamat}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-sigap-background focus:outline-none focus:ring-2 focus:ring-sigap-primary/20"
              placeholder="Alamat lengkap unit"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sigap-textSecondary mb-1.5">
              Kontak / Telepon{" "}
              <span className="text-sigap-textMuted font-normal">
                (opsional)
              </span>
            </label>
            <input
              type="text"
              name="kontak"
              value={formData.kontak}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-sigap-border rounded-lg text-sm bg-sigap-background focus:outline-none focus:ring-2 focus:ring-sigap-primary/20"
              placeholder="Nomor telepon atau email dinas"
            />
          </div>

          {submitError && (
            <p className="text-xs" style={{ color: colors.danger }}>
              {submitError}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 border border-sigap-border text-xs font-semibold rounded-lg hover:bg-sigap-background disabled:opacity-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-50 transition-colors shadow-sm"
              style={{ backgroundColor: colors.primary }}
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const Units = () => {
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

  const fetchUnits = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.units();
      setUnits(Array.isArray(data?.items) ? data.items : []);
      setPagination({
        page: 1,
        limit: 10,
        total: data?.items?.length ?? 0,
        total_pages: 1,
      });
    } catch (err) {
      logger.error("Failed to fetch units", { error: err });
      setError("Gagal memuat daftar unit. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits(1);
  }, []);

  const handlePageChange = (newPage: number) => {
    fetchUnits(newPage);
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
        await request<Unit>(`/units/${editingUnit.id}`, {
          method: "PUT",
          body: JSON.stringify(formData),
          token: true,
        });
        toast.success("Unit kerja berhasil diperbarui");
      } else {
        await request<Unit>("/units", {
          method: "POST",
          body: JSON.stringify(formData),
          token: true,
        });
        toast.success("Unit kerja berhasil ditambahkan");
      }
      fetchUnits(pagination.page);
      closeForm();
    } catch (err) {
      logger.error("Failed to save unit", { error: err });
      setSubmitError(
        err instanceof Error ? err.message : "Gagal menyimpan unit",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUnit) return;
    setIsDeleting(true);
    try {
      await request<{ success: boolean }>(`/units/${deleteUnit.id}`, {
        method: "DELETE",
        token: true,
      });
      setDeleteUnit(null);
      toast.success("Unit kerja berhasil dihapus");
      fetchUnits(pagination.page);
    } catch (err) {
      logger.error("Failed to delete unit", { error: err });
      toast.error(err instanceof Error ? err.message : "Gagal menghapus unit");
    } finally {
      setIsDeleting(false);
    }
  };

  const safeUnits = Array.isArray(units) ? units : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            Manajemen SKPD &amp; Unit Kerja
          </h2>
          <p className="text-xs text-sigap-textTertiary mt-0.5">
            Atur unit yang menerima tugas penanganan. Cantumkan nama, alamat,
            dan kontak agar admin dapat memilih penanggung jawab serta
            menghubunginya saat koordinasi.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-colors shadow-sm"
          style={{ backgroundColor: colors.primary }}
        >
          <span>+</span> Tambah Unit Kerja
        </button>
      </div>

      {showForm && (
        <UnitFormModal
          unit={editingUnit}
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

      <SigapCard padding={0}>
        {loading && (
          <div className="p-12 text-center">
            <div
              className="w-8 h-8 rounded-full border-2 border-sigap-primary border-t-transparent animate-spin mx-auto mb-3"
              style={{
                borderColor: colors.primary,
                borderTopColor: "transparent",
              }}
            />
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Memuat daftar unit...
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="p-6">
            <div
              className="p-4 rounded-lg text-xs flex items-center justify-between"
              style={{
                backgroundColor: colors.dangerBg,
                borderColor: colors.danger,
                color: colors.danger,
              }}
            >
              <span>{error}</span>
              <button
                onClick={() => fetchUnits(pagination.page)}
                className="font-semibold underline hover:no-underline ml-4"
              >
                Coba lagi
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (safeUnits?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <p className="text-xs mb-2" style={{ color: colors.textMuted }}>
              Belum ada unit kerja terdaftar.
            </p>
            <button
              onClick={openCreateForm}
              className="text-xs font-semibold hover:underline"
              style={{ color: colors.primary }}
            >
              + Tambah unit pertama sekarang
            </button>
          </div>
        )}

        {!loading && !error && (safeUnits?.length ?? 0) > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr
                    className="border-b border-sigap-border"
                    style={{ backgroundColor: colors.bgSurface }}
                  >
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold"
                      style={{ color: colors.textTertiary }}
                    >
                      Nama Unit
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold"
                      style={{ color: colors.textTertiary }}
                    >
                      Alamat
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold"
                      style={{ color: colors.textTertiary }}
                    >
                      Kontak
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold"
                      style={{ color: colors.textTertiary }}
                    >
                      Status
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-semibold"
                      style={{ color: colors.textTertiary }}
                    >
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {safeUnits.map((unit) => (
                    <tr
                      key={unit.id}
                      className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium text-sigap-textPrimary">
                        {unit.nama}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-sigap-textSecondary">
                        {unit.alamat ?? "-"}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-sigap-textSecondary font-mono">
                        {unit.kontak ?? "-"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={
                            unit.is_active
                              ? {
                                  backgroundColor: colors.successBg,
                                  color: colors.success,
                                }
                              : {
                                  backgroundColor: colors.bgSurface,
                                  color: colors.textTertiary,
                                }
                          }
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: unit.is_active
                                ? colors.success
                                : colors.textMuted,
                            }}
                          />
                          {unit.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openEditForm(unit)}
                            className="text-xs font-semibold text-sigap-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteUnit(unit)}
                            className="text-xs font-semibold hover:underline"
                            style={{ color: colors.danger }}
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-sigap-border bg-sigap-surface">
                <p className="text-xs text-sigap-textTertiary">
                  Menampilkan {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  dari {pagination.total} unit
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 text-xs font-semibold border border-sigap-border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-sigap-textTertiary px-2">
                    Halaman {pagination.page} dari {pagination.total_pages}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.total_pages}
                    className="px-3 py-1 text-xs font-semibold border border-sigap-border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SigapCard>
    </div>
  );
};
