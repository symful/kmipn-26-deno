import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { UserRow, UserRole, WilayahNode, AuditLogEntry } from "../../types";
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
  reason?: string;
}

interface AuditModal {
  user: UserRow;
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

export const AdminUsers = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [auditModal, setAuditModal] = useState<AuditModal | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<UserFormData>({
    email: "",
    password: "",
    name: "",
    role: "VERIFIKATOR",
    wilayah_id: null,
  });
  const [addErrors, setAddErrors] = useState<FormErrors>({});
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

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
      .catch((e) => { logger.error("Failed to fetch wilayah list", { error: e }); setWilayahList([]); })
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
    if (statusFilter === "active") params.is_active = true;
    else if (statusFilter === "inactive") params.is_active = false;

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
  }, [page, roleFilter, statusFilter, searchQuery]);

  const validateAddForm = (data: UserFormData): FormErrors => {
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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateAddForm(addForm);
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAddSubmitting(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      await api.createUser({
        email: addForm.email,
        password: addForm.password,
        name: addForm.name,
        role: addForm.role,
        wilayah_id: addForm.wilayah_id,
      });
      setAddSuccess("Pengguna berhasil ditambahkan");
      setAddForm({ email: "", password: "", name: "", role: "VERIFIKATOR", wilayah_id: null });
      setAddErrors({});
      setShowAddForm(false);
      fetchUsers();
    } catch (err) {
      logger.error("Failed to add user", { error: err });
      setAddError(err instanceof Error ? err.message : "Gagal menambahkan pengguna");
    } finally {
      setAddSubmitting(false);
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
    setConfirmModal({ user: u, action, reason: "" });
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

  const handleAuditOpen = (u: UserRow) => {
    setAuditModal({ user: u });
    setAuditEntries([]);
    setAuditTotal(0);
    setAuditPage(1);
    setAuditError(null);
    fetchUserAudit(u.id, 1);
  };

  const fetchUserAudit = (userId: string, pageNum: number) => {
    setAuditLoading(true);
    setAuditError(null);
    api
      .userAudit(userId, { page: pageNum, limit: 20 })
      .then((res) => {
        setAuditEntries(res.entries);
        setAuditTotal(res.total);
        setAuditPage(pageNum);
      })
      .catch((e) => {
        logger.error("Failed to fetch user audit log", { error: e });
        setAuditError("Gagal memuat audit log");
        setAuditEntries([]);
      })
      .finally(() => {
        setAuditLoading(false);
      });
  };

  const handleRoleChange = (role: UserRole) => {
    if (addForm.role !== role) {
      setAddForm((f) => ({ ...f, role, wilayah_id: null }));
    }
  };

  const getWilayahName = (wilayahId: string | null): string => {
    if (!wilayahId) return "-";
    const found = wilayahList.find((w) => w.id === wilayahId);
    return found ? found.name : wilayahId;
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
              <h1 className="text-xl font-bold tracking-tight">SIGAP Admin</h1>
              <p className="text-xs text-sigap-textMuted">
                {user?.name ?? ""} ({user?.role ?? ""})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Manajemen Pengguna</h2>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setAddError(null);
              setAddSuccess(null);
            }}
            className="px-4 py-2 rounded text-sm font-medium text-white"
            style={{ backgroundColor: colors.primary }}
          >
            {showAddForm ? "Batal" : "Tambah Pengguna"}
          </button>
        </div>

        {showAddForm && (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 mb-6">
            <h3 className="text-base font-semibold mb-4">Tambah Pengguna Baru</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="add-name" className="block text-sm font-medium mb-1">
                    Nama <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="add-name"
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    className={`w-full px-3 py-2 rounded border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary ${
                      addErrors.name ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="Nama lengkap"
                  />
                  {addErrors.name && <p className="text-xs text-red-500 mt-1">{addErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="add-email" className="block text-sm font-medium mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="add-email"
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                    className={`w-full px-3 py-2 rounded border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary ${
                      addErrors.email ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="email@contoh.com"
                  />
                  {addErrors.email && <p className="text-xs text-red-500 mt-1">{addErrors.email}</p>}
                </div>
                <div>
                  <label htmlFor="add-password" className="block text-sm font-medium mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="add-password"
                    type="password"
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    className={`w-full px-3 py-2 rounded border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary ${
                      addErrors.password ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="Minimal 8 karakter"
                  />
                  {addErrors.password && <p className="text-xs text-red-500 mt-1">{addErrors.password}</p>}
                </div>
                <div>
                  <label htmlFor="add-role" className="block text-sm font-medium mb-1">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="add-role"
                    value={addForm.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className={`w-full px-3 py-2 rounded border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary ${
                      addErrors.role ? "border-red-500" : "border-sigap-border"
                    }`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {addErrors.role && <p className="text-xs text-red-500 mt-1">{addErrors.role}</p>}
                </div>
                <div>
                  <label htmlFor="add-wilayah" className="block text-sm font-medium mb-1">
                    Wilayah Scope{" "}
                    {WILAYAH_SCOPED_ROLES.includes(addForm.role) && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="add-wilayah"
                    value={addForm.wilayah_id ?? ""}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        wilayah_id: e.target.value || null,
                      }))
                    }
                    className={`w-full px-3 py-2 rounded border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary ${
                      addErrors.wilayah_id ? "border-red-500" : "border-sigap-border"
                    }`}
                    disabled={wilayahLoading}
                  >
                    <option value="">
                      {wilayahLoading ? "Memuat..." : WILAYAH_SCOPED_ROLES.includes(addForm.role) ? "Pilih Wilayah" : "Tidak ada (Global)"}
                    </option>
                    {wilayahList.map((w) => (
                      <option key={w.id} value={w.id}>
                        [{w.level}] {w.name}
                      </option>
                    ))}
                  </select>
                  {addErrors.wilayah_id && <p className="text-xs text-red-500 mt-1">{addErrors.wilayah_id}</p>}
                  {!WILAYAH_SCOPED_ROLES.includes(addForm.role) && (
                    <p className="text-xs text-sigap-textMuted mt-1">Role ini tidak menggunakan scope wilayah</p>
                  )}
                </div>
              </div>

              {addError && (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                  {addError}
                </div>
              )}
              {addSuccess && (
                <div className="p-3 rounded bg-green-50 border border-green-200 text-sm text-green-700">
                  {addSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={addSubmitting}
                className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: colors.primary }}
              >
                {addSubmitting ? "Menyimpan..." : "Tambah Pengguna"}
              </button>
            </form>
          </div>
        )}

        <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search-filter" className="block text-xs font-medium mb-1">
                Cari
              </label>
              <input
                id="search-filter"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Nama atau email..."
                className="w-full px-3 py-2 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              />
            </div>
            <div>
              <label htmlFor="role-filter" className="block text-xs font-medium mb-1">
                Filter Role
              </label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as UserRole | "");
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="">Semua Role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="status-filter" className="block text-xs font-medium mb-1">
                Filter Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | "active" | "inactive");
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Daftar Pengguna</h3>
            <p className="text-sm text-sigap-textMuted">{total} total</p>
          </div>

          {loading ? (
            <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-sigap-textMuted py-8">Tidak ada data pengguna.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sigap-border">
                      <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">Nama</th>
                      <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">Email</th>
                      <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">Role</th>
                      <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">Wilayah</th>
                      <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">Status</th>
                      <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50"
                      >
                        <td className="py-2 px-3">{u.name}</td>
                        <td className="py-2 px-3 text-sigap-textMuted">{u.email}</td>
                        <td className="py-2 px-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-sigap-primary/10 text-sigap-primary">
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-sigap-textMuted text-xs">
                          {getWilayahName(u.wilayah_id)}
                        </td>
                        <td className="py-2 px-3">
                          {u.disabled ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              Nonaktif
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                              Aktif
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleEditOpen(u)}
                              className="text-xs text-sigap-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleAuditOpen(u)}
                              className="text-xs text-sigap-primary hover:underline"
                            >
                              Audit
                            </button>
                            {u.disabled ? (
                              <button
                                onClick={() => handleConfirmOpen(u, "reactivate")}
                                className="text-xs text-green-600 hover:underline"
                              >
                                Aktifkan
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleConfirmOpen(u, "deactivate")}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Nonaktifkan
                                </button>
                                <button
                                  onClick={() => handleConfirmOpen(u, "delete")}
                                  className="text-xs text-red-700 hover:underline font-medium"
                                >
                                  Hapus
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-sigap-textMuted">
                    Menampilkan {users.length} dari {total} data
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-background"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-sigap-textMuted">
                      Halaman {page} dari {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-background"
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

      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Pengguna</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-sigap-textMuted mb-1">Nama</p>
                <p className="text-sm font-medium">{editModal.user.name}</p>
              </div>
              <div>
                <p className="text-sm text-sigap-textMuted mb-1">Email</p>
                <p className="text-sm font-medium">{editModal.user.email}</p>
              </div>
              <div>
                <label htmlFor="edit-role" className="block text-sm font-medium mb-1">
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
                  className="w-full px-3 py-2 rounded border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleEditSave}
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-sigap-primary text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50"
                >
                  {editSubmitting ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  onClick={() => {
                    setEditModal(null);
                    setEditError(null);
                  }}
                  className="px-4 py-2 border border-sigap-border text-sm font-medium rounded hover:bg-sigap-background"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">
              {confirmModal.action === "delete"
                ? "Hapus Pengguna"
                : confirmModal.action === "deactivate"
                  ? "Nonaktifkan Pengguna"
                  : "Aktifkan Pengguna"}
            </h3>
            <p className="text-sm text-sigap-textMuted mb-4">
              {confirmModal.action === "delete"
                ? `Apakah Anda yakin ingin menghapus ${confirmModal.user.name}? Pengguna tidak akan dapat login lagi.`
                : confirmModal.action === "deactivate"
                  ? `Apakah Anda yakin ingin menonaktifkan ${confirmModal.user.name}? Pengguna tidak akan dapat login setelah dinonaktifkan.`
                  : `Apakah Anda yakin ingin mengaktifkan kembali ${confirmModal.user.name}?`}
            </p>
            {confirmError && <p className="text-sm text-red-500 mb-3">{confirmError}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={`px-4 py-2 text-white text-sm font-medium rounded disabled:opacity-50 ${
                  confirmModal.action === "delete"
                    ? "bg-red-600 hover:bg-red-700"
                    : confirmModal.action === "deactivate"
                      ? "bg-red-500 hover:bg-red-600"
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
              <button
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmError(null);
                }}
                className="px-4 py-2 border border-sigap-border text-sm font-medium rounded hover:bg-sigap-background"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {auditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Audit Log</h3>
                <p className="text-sm text-sigap-textMuted">
                  {auditModal.user.name} ({auditModal.user.email})
                </p>
              </div>
              <button
                onClick={() => setAuditModal(null)}
                className="text-sigap-textMuted hover:text-sigap-textSecondary"
              >
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
              </button>
            </div>

            {auditLoading ? (
              <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
            ) : auditError ? (
              <div className="p-4 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                {auditError}
              </div>
            ) : auditEntries.length === 0 ? (
              <p className="text-center text-sigap-textMuted py-8">Tidak ada entri audit.</p>
            ) : (
              <>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-sigap-surface">
                      <tr className="border-b border-sigap-border">
                        <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">
                          Timestamp
                        </th>
                        <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">
                          Action
                        </th>
                        <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">
                          Before
                        </th>
                        <th className="text-left py-2 px-3 font-semibold text-sigap-textMuted">
                          After
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEntries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-sigap-border last:border-0"
                        >
                          <td className="py-2 px-3 text-sigap-textMuted whitespace-nowrap">
                            {new Date(entry.created_at).toLocaleString("id-ID")}
                          </td>
                          <td className="py-2 px-3">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-sigap-primary/10 text-sigap-primary">
                              {entry.action}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-xs font-mono max-w-[200px] truncate">
                            {entry.before ? JSON.stringify(entry.before) : "-"}
                          </td>
                          <td className="py-2 px-3 text-xs font-mono max-w-[200px] truncate">
                            {entry.after ? JSON.stringify(entry.after) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {auditTotal > 20 && (
                  <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-sigap-border">
                    <button
                      onClick={() => fetchUserAudit(auditModal.user.id, auditPage - 1)}
                      disabled={auditPage === 1}
                      className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-background"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-sigap-textMuted">
                      Halaman {auditPage} ({auditTotal} total)
                    </span>
                    <button
                      onClick={() => fetchUserAudit(auditModal.user.id, auditPage + 1)}
                      disabled={auditPage * 20 >= auditTotal}
                      className="px-3 py-1.5 rounded border border-sigap-border text-sm disabled:opacity-50 hover:bg-sigap-background"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};