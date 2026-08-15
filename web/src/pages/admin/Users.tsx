import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { UserRow, UserRole, WilayahNode } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

const ROLES: UserRole[] = [
  "ADMIN",
  "VERIFIKATOR",
  "SURVEYOR",
  "OPERATOR",
  "RT_RW",
  "PETUGAS",
  "ADMIN_DAERAH",
  "AUDITOR",
  "PENGAMBIL_KEPUTUSAN",
];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  VERIFIKATOR: "Verifikator",
  SURVEYOR: "Surveyor",
  OPERATOR: "Operator",
  RT_RW: "RT/RW",
  PETUGAS: "Petugas",
  ADMIN_DAERAH: "Admin Daerah",
  AUDITOR: "Auditor",
  PENGAMBIL_KEPUTUSAN: "Pengambil Keputusan",
};

const WILAYAH_SCOPED_ROLES: UserRole[] = ["ADMIN_DAERAH", "VERIFIKATOR", "SURVEYOR", "OPERATOR", "PETUGAS"];

interface EditModal {
  user: UserRow;
  role: UserRole;
  wilayah_id: string | null;
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
  wilayah_id: string | null;
}

interface FormErrors {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
  wilayah_id?: string;
}


const PencilIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const UserPlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

export const AdminUsers = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [searchQuery, setSearchQuery] = useState("");

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
    role: "VERIFIKATOR",
    wilayah_id: null,
  });
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [wilayahList, setWilayahList] = useState<WilayahNode[]>([]);
  const [wilayahLoading, setWilayahLoading] = useState(false);

  const user = useAuthStore((s) => s.user);

  const fetchWilayahList = () => {
    setWilayahLoading(true);
    api
      .wilayah()
      .then((data) => {
        setWilayahList(data.wilayah ?? []);
      })
      .catch((e) => {
        logger.error("Failed to fetch wilayah list", { error: e });
        setWilayahList([]);
      })
      .finally(() => setWilayahLoading(false));
  };

  const fetchUsers = () => {
    setLoading(true);
    const params: { page: number; limit: number; role?: string; search?: string; is_active?: boolean } = {
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
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchWilayahList();
  }, []);

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
    if (WILAYAH_SCOPED_ROLES.includes(data.role) && !data.wilayah_id) {
      errors.wilayah_id = "Wilayah wajib dipilih untuk role ini";
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
        wilayah_id: createForm.wilayah_id,
      });
      setCreateSuccess("Pengguna berhasil ditambahkan");
      setCreateForm({ email: "", password: "", name: "", role: "VERIFIKATOR", wilayah_id: null });
      setCreateErrors({});
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess(null);
        fetchUsers();
      }, 1500);
    } catch (err) {
      logger.error("Failed to add user", { error: err });
      setCreateError(err instanceof Error ? err.message : "Gagal menambahkan pengguna");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditOpen = (u: UserRow) => {
    setEditModal({ user: u, role: u.role, wilayah_id: u.wilayah_id });
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
      setEditError(err instanceof Error ? err.message : "Gagal menyimpan perubahan");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmOpen = (u: UserRow, action: "delete" | "deactivate" | "reactivate") => {
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
      setConfirmError(err instanceof Error ? err.message : "Gagal mengubah status pengguna");
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleRoleChange = (role: UserRole) => {
    if (createForm.role !== role) {
      setCreateForm((f) => ({ ...f, role, wilayah_id: null }));
    }
  };

  const getWilayahName = (wilayahId: string | null): string => {
    if (!wilayahId) return "-";
    const found = wilayahList.find((w) => w.id === wilayahId);
    return found ? found.name : wilayahId;
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
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface border-b border-sigap-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: colors.primary }}
              >
                S
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-sigap-textPrimary">SIGAP Admin</h1>
                <p className="text-xs text-sigap-textMuted">
                  {user?.name ?? ""} ({user?.role ?? ""})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="text-sm font-medium text-sigap-primary hover:underline"
              >
                Beranda
              </Link>
              <button
                onClick={() => useAuthStore.getState().clear()}
                className="text-sm text-sigap-perluTindakan hover:underline"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-sigap-textPrimary">Manajemen User</h2>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreateError(null);
              setCreateSuccess(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-btn text-sm font-semibold text-white shadow-btn-primary transition-all hover:opacity-90"
            style={{ backgroundColor: colors.primary }}
          >
            <UserPlusIcon />
            Buat User
          </button>
        </div>

        <div className="bg-sigap-surface rounded-card border border-sigap-border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="search-filter" className="block text-xs font-medium text-sigap-textSecondary mb-1.5">
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-md border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="role-filter" className="block text-xs font-medium text-sigap-textSecondary mb-1.5">
                Filter Role
              </label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as UserRole | "");
                  setPage(1);
                }}
                className="w-full px-4 py-2.5 rounded-md border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
              >
                <option value="">Semua Role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

          <div className="bg-sigap-surface rounded-card border border-sigap-border overflow-hidden">
          <div className="px-6 py-4 border-b border-sigap-border flex items-center justify-between">
            <h3 className="text-base font-semibold text-sigap-textPrimary">Daftar User</h3>
            <p className="text-sm text-sigap-textMuted">{total} total</p>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center gap-2 text-sigap-textMuted">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Memuat...
              </div>
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-12 text-center text-sigap-textMuted">Tidak ada data user.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-sigap-background border-b border-sigap-border">
                      <th className="text-left py-3 px-6 font-semibold text-sigap-textSecondary">Email</th>
                      <th className="text-left py-3 px-6 font-semibold text-sigap-textSecondary">Nama</th>
                      <th className="text-left py-3 px-6 font-semibold text-sigap-textSecondary">Role</th>
                      <th className="text-left py-3 px-6 font-semibold text-sigap-textSecondary">Status</th>
                      <th className="text-left py-3 px-6 font-semibold text-sigap-textSecondary">Dibuat</th>
                      <th className="text-left py-3 px-6 font-semibold text-sigap-textSecondary">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50 transition-colors"
                      >
                        <td className="py-3.5 px-6 text-sigap-textMuted">{u.email}</td>
                        <td className="py-3.5 px-6 font-medium text-sigap-textPrimary">{u.name}</td>
                        <td className="py-3.5 px-6">
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-600">
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          {u.disabled ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                              Inactive
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-sigap-textMuted">{formatDate(u.created_at)}</td>
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditOpen(u)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sigap-textMuted hover:text-sigap-primary hover:bg-sigap-primary/10 transition-colors"
                              title="Edit"
                            >
                              <PencilIcon />
                            </button>

                            {u.disabled ? (
                              <button
                                onClick={() => handleConfirmOpen(u, "reactivate")}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sigap-textMuted hover:text-green-600 hover:bg-green-50 transition-colors"
                                title="Aktifkan"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleConfirmOpen(u, "deactivate")}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sigap-textMuted hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="Nonaktifkan"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              </button>
                            )}

                            <button
                              onClick={() => handleConfirmOpen(u, "delete")}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sigap-textMuted hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Hapus"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-sigap-border flex items-center justify-between">
                  <p className="text-sm text-sigap-textMuted">
                    Menampilkan {users.length} dari {total} data
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 rounded border border-sigap-border text-sm text-sigap-textSecondary hover:bg-sigap-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-sigap-textMuted px-2">
                      Halaman {page} dari {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 rounded border border-sigap-border text-sm text-sigap-textSecondary hover:bg-sigap-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sigap-surface rounded-card border border-sigap-border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border">
              <h3 className="text-lg font-semibold text-sigap-textPrimary">Buat User</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setCreateForm({ email: "", password: "", name: "", role: "VERIFIKATOR", wilayah_id: null });
                  setCreateErrors({});
                }}
                className="text-sigap-textMuted hover:text-sigap-textPrimary transition-colors"
              >
                <XIcon />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form id="create-user-form" onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label htmlFor="create-name" className="block text-sm font-medium text-sigap-textSecondary mb-1.5">
                    Nama <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-md border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.name ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="Nama lengkap"
                  />
                  {createErrors.name && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-email" className="block text-sm font-medium text-sigap-textSecondary mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-md border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.email ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="email@contoh.com"
                  />
                  {createErrors.email && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-password" className="block text-sm font-medium text-sigap-textSecondary mb-1.5">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="create-password"
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-md border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.password ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="Minimal 8 karakter"
                  />
                  {createErrors.password && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.password}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-role" className="block text-sm font-medium text-sigap-textSecondary mb-1.5">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="create-role"
                    value={createForm.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className={`w-full px-4 py-2.5 rounded-md border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.role ? "border-red-500" : "border-sigap-border"
                    }`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {createErrors.role && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.role}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-wilayah" className="block text-sm font-medium text-sigap-textSecondary mb-1.5">
                    Wilayah Scope{" "}
                    {WILAYAH_SCOPED_ROLES.includes(createForm.role) && (
                      <span className="text-red-500">*</span>
                    )}
                  </label>
                  <select
                    id="create-wilayah"
                    value={createForm.wilayah_id ?? ""}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        wilayah_id: e.target.value || null,
                      }))
                    }
                    className={`w-full px-4 py-2.5 rounded-md border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors ${
                      createErrors.wilayah_id ? "border-red-500" : "border-sigap-border"
                    }`}
                    disabled={wilayahLoading}
                  >
                    <option value="">
                      {wilayahLoading
                        ? "Memuat..."
                        : WILAYAH_SCOPED_ROLES.includes(createForm.role)
                        ? "Pilih Wilayah"
                        : "Tidak ada (Global)"}
                    </option>
                    {wilayahList.map((w) => (
                      <option key={w.id} value={w.id}>
                        [{w.level}] {w.name}
                      </option>
                    ))}
                  </select>
                  {createErrors.wilayah_id && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.wilayah_id}</p>
                  )}
                  {!WILAYAH_SCOPED_ROLES.includes(createForm.role) && (
                    <p className="text-xs text-sigap-textMuted mt-1">
                      Role ini tidak menggunakan scope wilayah
                    </p>
                  )}
                </div>

                {createError && (
                  <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
                    {createError}
                  </div>
                )}

                {createSuccess && (
                  <div className="p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-700">
                    {createSuccess}
                  </div>
                )}
              </form>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-background">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setCreateForm({ email: "", password: "", name: "", role: "VERIFIKATOR", wilayah_id: null });
                  setCreateErrors({});
                }}
                className="px-4 py-2 rounded-md border border-sigap-border text-sm font-medium text-sigap-textSecondary hover:bg-sigap-surface transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                form="create-user-form"
                disabled={createSubmitting}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {createSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sigap-surface rounded-card border border-sigap-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border">
              <h3 className="text-lg font-semibold text-sigap-textPrimary">Edit User</h3>
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
                <p className="text-sm text-sigap-textMuted mb-1">Nama</p>
                <p className="text-sm font-medium text-sigap-textPrimary">{editModal.user.name}</p>
              </div>
              <div>
                <p className="text-sm text-sigap-textMuted mb-1">Email</p>
                <p className="text-sm font-medium text-sigap-textPrimary">{editModal.user.email}</p>
              </div>
              <div>
                <label htmlFor="edit-role" className="block text-sm font-medium text-sigap-textSecondary mb-1.5">
                  Role
                </label>
                <select
                  id="edit-role"
                  value={editModal.role}
                  onChange={(e) =>
                    setEditModal((m) =>
                      m ? { ...m, role: e.target.value as UserRole } : null
                    )
                  }
                  className="w-full px-4 py-2.5 rounded-md border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-background">
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditError(null);
                }}
                className="px-4 py-2 rounded-md border border-sigap-border text-sm font-medium text-sigap-textSecondary hover:bg-sigap-surface transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSubmitting}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                {editSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sigap-surface rounded-card border border-sigap-border w-full max-w-sm">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-sigap-textPrimary mb-2">
                {confirmModal.action === "delete"
                  ? "Hapus User"
                  : confirmModal.action === "deactivate"
                  ? "Nonaktifkan User"
                  : "Aktifkan User"}
              </h3>
              <p className="text-sm text-sigap-textMuted">
                {confirmModal.action === "delete"
                  ? `Apakah Anda yakin ingin menghapus ${confirmModal.user.name}? User tidak akan dapat login lagi.`
                  : confirmModal.action === "deactivate"
                  ? `Apakah Anda yakin ingin menonaktifkan ${confirmModal.user.name}?`
                  : `Apakah Anda yakin ingin mengaktifkan kembali ${confirmModal.user.name}?`}
              </p>
              {confirmError && (
                <p className="text-sm text-red-500 mt-3">{confirmError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-background">
              <button
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmError(null);
                }}
                className="px-4 py-2 rounded-md border border-sigap-border text-sm font-medium text-sigap-textSecondary hover:bg-sigap-surface transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={`px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-opacity ${
                  confirmModal.action === "delete"
                    ? "bg-red-600 hover:bg-red-700"
                    : confirmModal.action === "deactivate"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-green-600 hover:bg-green-700"
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
