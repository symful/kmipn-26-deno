import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { UserRow, UserRole } from "../types";
import { useAuthStore } from "../stores/auth";
import { colors, extendedColors } from "../theme/tokens";
import { logger } from "@/lib/logger";
import { SigapCard } from "../components/design-system/Card";
import { EmptyState } from "../components/design-system/EmptyState";
import { ErrorRetry } from "../components/design-system/ErrorRetry";
import { Skeleton } from "../components/design-system/Skeleton";
import { UsersIcon } from "../theme/icons";
import { ROLES, ROLE_LABELS } from "../lib/roles";

interface EditModal {
  user: UserRow;
  role: UserRole;
}

interface ConfirmModal {
  user: UserRow;
  action: "delete" | "deactivate" | "reactivate";
}

interface UserFormData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

interface FormErrors {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
}

const PencilIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

const UserPlusIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
    />
  </svg>
);

const XIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

const SearchIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);
export const Users = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormData>({
    email: "",
    password: "",
    name: "",
    role: "ADMIN",
  });
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    const params: {
      page: number;
      limit: number;
      role?: string;
      search?: string;
      is_active?: boolean;
    } = {
      page,
      limit,
    };

    if (roleFilter) params.role = roleFilter;
    if (searchQuery) params.search = searchQuery;

    api
      .users(params)
      .then((res) => {
        setUsers(res.data);
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.total_pages);
      })
      .catch((err) => {
        logger.error("Failed to fetch users", { error: err });
        setUsers([]);
        setTotal(0);
        setFetchError("Gagal memuat daftar pengguna");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, searchQuery]);

  const validateCreateForm = (data: UserFormData): FormErrors => {
    const errors: FormErrors = {};
    if (!data.email.trim()) {
      errors.email = "Email wajib diisi";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = "Format email tidak valid";
    }
    if (!data.password) {
      errors.password = "Password wajib diisi";
    } else if (data.password.length < 8) {
      errors.password = "Password minimal 8 karakter";
    }
    if (!data.name.trim()) {
      errors.name = "Nama wajib diisi";
    } else if (data.name.trim().length < 2) {
      errors.name = "Nama minimal 2 karakter";
    }
    if (!data.role) {
      errors.role = "Role wajib dipilih";
    }
    return errors;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCreateForm(createForm);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreateSubmitting(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await api.createUser({
        email: createForm.email,
        password: createForm.password,
        name: createForm.name,
        role: createForm.role,
      });
      setCreateSuccess("Pengguna berhasil ditambahkan");
      setCreateForm({ email: "", password: "", name: "", role: "ADMIN" });
      setCreateErrors({});
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess(null);
        fetchUsers();
      }, 1500);
    } catch (err) {
      logger.error("Failed to add user", { error: err });
      setCreateError(
        err instanceof Error ? err.message : "Gagal menambahkan pengguna",
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditOpen = (u: UserRow) => {
    setEditModal({ user: u, role: u.role });
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await api.updateUser(editModal.user.id, {
        role: editModal.role,
      });
      setEditModal(null);
      fetchUsers();
    } catch (err) {
      logger.error("Failed to update user", { error: err });
      setEditError(
        err instanceof Error ? err.message : "Gagal menyimpan perubahan",
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmOpen = (
    u: UserRow,
    action: "delete" | "deactivate" | "reactivate",
  ) => {
    setConfirmModal({ user: u, action });
    setConfirmError(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmModal) return;
    setConfirmSubmitting(true);
    setConfirmError(null);
    try {
      if (confirmModal.action === "delete") {
        await api.deleteUser(confirmModal.user.id);
      } else if (confirmModal.action === "deactivate") {
        await api.deactivateUser(confirmModal.user.id);
      } else {
        await api.reactivateUser(confirmModal.user.id);
      }
      setConfirmModal(null);
      fetchUsers();
    } catch (err) {
      logger.error("Failed to change user status", { error: err });
      setConfirmError(
        err instanceof Error ? err.message : "Gagal mengubah status pengguna",
      );
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleRoleChange = (role: UserRole) => {
    if (createForm.role !== role) {
      setCreateForm((f) => ({ ...f, role }));
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            Manajemen Pengguna
          </h2>
          <p className="text-xs text-sigap-textTertiary mt-0.5">
            Atur peran dan akses akun sesuai tugas pengguna. Periksa akun yang
            Anda pilih sebelum mengubah akses atau menonaktifkannya.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreateError(null);
              setCreateSuccess(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity shadow-sm"
            style={{ backgroundColor: colors.primary }}
          >
            <UserPlusIcon />
            <span>Buat Pengguna</span>
          </button>
        </div>
      </div>

      {/* Filters Card */}
      <SigapCard padding={16}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="search-filter"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: colors.textTertiary }}
            >
              Cari
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon />
              </div>
              <input
                id="search-filter"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Nama atau email..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm placeholder-shown transition-colors focus:outline-none focus:ring-2"
                style={{
                  borderColor: colors.borderCard,
                  backgroundColor: extendedColors.bgScreen,
                  color: colors.textPrimary,
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="role-filter"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: colors.textTertiary }}
            >
              Pilih peran
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as UserRole | "");
                setPage(1);
              }}
              className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{
                borderColor: colors.borderCard,
                backgroundColor: extendedColors.bgScreen,
                color: colors.textPrimary,
              }}
            >
              <option value="">Semua peran</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SigapCard>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <SigapCard severity="primary" padding={16}>
          <div className="text-2xl font-bold" style={{ color: colors.primary }}>
            {total}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{ color: colors.textTertiary }}
          >
            Jumlah akun
          </div>
        </SigapCard>
        <SigapCard severity="info" padding={16}>
          <div className="text-2xl font-bold" style={{ color: colors.info }}>
            {(Array.isArray(users) ? users : []).filter((u) => !u.disabled)
              .length ?? 0}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{ color: colors.textTertiary }}
          >
            Aktif
          </div>
        </SigapCard>
        <SigapCard padding={16}>
          <div
            className="text-2xl font-bold"
            style={{ color: colors.textMuted }}
          >
            {(Array.isArray(users) ? users : []).filter((u) => u.disabled)
              .length ?? 0}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{ color: colors.textTertiary }}
          >
            Nonaktif
          </div>
        </SigapCard>
      </div>

      {/* Table Card */}
      <SigapCard padding={0} className="overflow-hidden">
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: colors.borderCard }}
        >
          <h3
            className="text-base font-bold"
            style={{ color: colors.textPrimary }}
          >
            Daftar akun
          </h3>
          <p className="text-sm" style={{ color: colors.textTertiary }}>
            {total} total
          </p>
        </div>

        {loading ? (
          <div className="px-6 py-8">
            <Skeleton.List itemCount={5} itemHeight={64} />
          </div>
        ) : fetchError ? (
          <div className="px-6 py-8">
            <ErrorRetry error={fetchError} onRetry={fetchUsers} />
          </div>
        ) : ((Array.isArray(users) ? users : []).length ?? 0) === 0 ? (
          <div className="px-6 py-8">
            <EmptyState
              icon={<UsersIcon size={48} />}
              title="Tidak ada akun yang sesuai"
              subtitle="Ubah pencarian atau tambahkan akun agar pengguna dapat menjalankan tugasnya."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      backgroundColor: extendedColors.bgScreen,
                      borderColor: colors.borderCard,
                    }}
                  >
                    <th className="text-left py-3 px-6 text-xs font-semibold">
                      Email
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold">
                      Nama
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold">
                      Role
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold">
                      Status
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold">
                      Dibuat
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(users) ? users : []).map((u) => (
                    <tr
                      key={u.id}
                      className="border-b last:border-0 hover:bg-[var(--card-bg)] transition-colors"
                      style={{ borderColor: colors.borderCard }}
                    >
                      <td
                        className="py-3.5 px-6"
                        style={{ color: colors.textMuted }}
                      >
                        {u.email}
                      </td>
                      <td
                        className="py-3.5 px-6 font-medium"
                        style={{ color: colors.textPrimary }}
                      >
                        {u.name}
                      </td>
                      <td className="py-3.5 px-6">
                        <span
                          className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: extendedColors.primaryLightVariant,
                            color: colors.primaryDark,
                          }}
                        >
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        {u.disabled ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: extendedColors.bgSoft,
                              color: colors.textMuted,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: colors.textMuted }}
                            />
                            Nonaktif
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: colors.successBg,
                              color: colors.success,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: colors.success }}
                            />
                            Aktif
                          </span>
                        )}
                      </td>
                      <td
                        className="py-3.5 px-6"
                        style={{ color: colors.textMuted }}
                      >
                        {formatDate(u.created_at)}
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditOpen(u)}
                            aria-label={`Edit pengguna ${u.name || u.email}`}
                            className="inline-flex items-center justify-center w-8 h-8 min-h-11 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                            style={{ color: colors.textMuted }}
                          >
                            <PencilIcon />
                          </button>

                          {u.disabled ? (
                            <button
                              onClick={() => handleConfirmOpen(u, "reactivate")}
                              aria-label={`Aktifkan pengguna ${u.name || u.email}`}
                              className="inline-flex items-center justify-center w-8 h-8 min-h-11 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                              style={{ color: colors.success }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleConfirmOpen(u, "deactivate")}
                              aria-label={`Nonaktifkan pengguna ${u.name || u.email}`}
                              className="inline-flex items-center justify-center w-8 h-8 min-h-11 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                              style={{ color: colors.warning }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div
                className="px-6 py-4 border-t flex items-center justify-between"
                style={{ borderColor: colors.borderCard }}
              >
                <p className="text-sm" style={{ color: colors.textTertiary }}>
                  Menampilkan {users.length ?? 0} dari {total} data
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 min-h-11 rounded-lg border text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                    style={{
                      borderColor: colors.borderCard,
                      color: colors.textTertiary,
                    }}
                  >
                    Prev
                  </button>
                  <span
                    className="text-sm px-2"
                    style={{ color: colors.textTertiary }}
                  >
                    Halaman {page} dari {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 min-h-11 rounded-lg border text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                    style={{
                      borderColor: colors.borderCard,
                      color: colors.textTertiary,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SigapCard>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-sigap-border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border">
              <h3 className="text-lg font-bold text-sigap-textPrimary">
                Buat akun
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setCreateForm({
                    email: "",
                    password: "",
                    name: "",
                    role: "ADMIN",
                  });
                  setCreateErrors({});
                }}
                className="text-sigap-textMuted hover:text-sigap-textPrimary transition-colors"
              >
                <XIcon />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form
                id="create-user-form"
                onSubmit={handleCreateSubmit}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="create-name"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Nama <span className="text-danger-500">*</span>
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className={`w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.name
                        ? "border-danger-500"
                        : "border-sigap-border"
                    }`}
                    placeholder="Nama lengkap"
                  />
                  {createErrors.name && (
                    <p className="text-xs text-danger-500 mt-1">
                      {createErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="create-email"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Email <span className="text-danger-500">*</span>
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className={`w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.email
                        ? "border-danger-500"
                        : "border-sigap-border"
                    }`}
                    placeholder="email@contoh.com"
                  />
                  {createErrors.email && (
                    <p className="text-xs text-danger-500 mt-1">
                      {createErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="create-password"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Password <span className="text-danger-500">*</span>
                  </label>
                  <input
                    id="create-password"
                    type="password"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, password: e.target.value }))
                    }
                    className={`w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.password
                        ? "border-danger-500"
                        : "border-sigap-border"
                    }`}
                    placeholder="Minimal 8 karakter"
                  />
                  {createErrors.password && (
                    <p className="text-xs text-danger-500 mt-1">
                      {createErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="create-role"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Role <span className="text-danger-500">*</span>
                  </label>
                  <select
                    id="create-role"
                    value={createForm.role}
                    onChange={(e) =>
                      handleRoleChange(e.target.value as UserRole)
                    }
                    className={`w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.role
                        ? "border-danger-500"
                        : "border-sigap-border"
                    }`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {createErrors.role && (
                    <p className="text-xs text-danger-500 mt-1">
                      {createErrors.role}
                    </p>
                  )}
                </div>

                {createError && (
                  <div className="p-3 rounded-lg bg-danger-100 border border-danger-200 text-sm text-danger-600">
                    {createError}
                  </div>
                )}

                {createSuccess && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                    {createSuccess}
                  </div>
                )}
              </form>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-surface">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setCreateForm({
                    email: "",
                    password: "",
                    name: "",
                    role: "ADMIN",
                  });
                  setCreateErrors({});
                }}
                className="px-4 py-2 rounded-lg border border-sigap-border text-sm font-medium text-sigap-textTertiary hover:bg-sigap-background transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                form="create-user-form"
                disabled={createSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sigap-primary hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {createSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ubah akun Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-sigap-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border">
              <h3 className="text-lg font-bold text-sigap-textPrimary">
                Ubah akun
              </h3>
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditError(null);
                }}
                className="text-sigap-textMuted hover:text-sigap-textPrimary transition-colors"
              >
                <XIcon />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-sigap-textMuted mb-1">Nama</p>
                <p className="text-sm font-semibold text-sigap-textPrimary">
                  {editModal.user.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-sigap-textMuted mb-1">Email</p>
                <p className="text-sm font-semibold text-sigap-textPrimary">
                  {editModal.user.email}
                </p>
              </div>
              <div>
                <label
                  htmlFor="edit-role"
                  className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                >
                  Role
                </label>
                <select
                  id="edit-role"
                  value={editModal.role}
                  onChange={(e) =>
                    setEditModal((m) =>
                      m ? { ...m, role: e.target.value as UserRole } : null,
                    )
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {editError && (
                <p className="text-sm text-danger-500">{editError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-surface">
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditError(null);
                }}
                className="px-4 py-2 min-h-11 rounded-lg border border-sigap-border text-sm font-medium text-sigap-textTertiary hover:bg-sigap-background transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
              >
                Batal
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSubmitting}
                className="px-4 py-2 min-h-11 rounded-lg text-sm font-semibold text-white bg-sigap-primary hover:bg-primary-600 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
              >
                {editSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-sigap-border w-full max-w-sm">
            <div className="p-6">
              <h3 className="text-lg font-bold text-sigap-textPrimary mb-2">
                {confirmModal.action === "delete"
                  ? "Nonaktifkan akun"
                  : confirmModal.action === "deactivate"
                    ? "Nonaktifkan akun"
                    : "Aktifkan akun"}
              </h3>
              <p className="text-sm text-sigap-textTertiary">
                {confirmModal.action === "delete"
                  ? `Nonaktifkan akun ${confirmModal.user.name}? Pengguna tidak dapat masuk sampai admin mengaktifkan kembali akun ini.`
                  : confirmModal.action === "deactivate"
                    ? `Nonaktifkan akun ${confirmModal.user.name}? Pengguna tidak dapat masuk sampai admin mengaktifkan kembali akun ini.`
                    : `Aktifkan kembali akun ${confirmModal.user.name} agar pengguna dapat masuk dengan perannya saat ini.`}
              </p>
              {confirmError && (
                <p className="text-sm text-danger-500 mt-3">{confirmError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-surface">
              <button
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmError(null);
                }}
                className="px-4 py-2 min-h-11 rounded-lg border border-sigap-border text-sm font-medium text-sigap-textTertiary hover:bg-sigap-background transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={`px-4 py-2 min-h-11 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2 ${
                  confirmModal.action === "delete"
                    ? "bg-danger-500 hover:bg-danger-600"
                    : confirmModal.action === "deactivate"
                      ? "bg-warning-500 hover:bg-warning-600"
                      : "bg-sigap-primary hover:bg-primary-600"
                }`}
              >
                {confirmSubmitting
                  ? "Menyimpan..."
                  : confirmModal.action === "delete"
                    ? "Hapus"
                    : confirmModal.action === "deactivate"
                      ? "Nonaktifkan"
                      : "Aktifkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
