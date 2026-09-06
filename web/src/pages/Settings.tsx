import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Category, UserRow, UserRole, Unit } from "../types";
import { useAuthStore } from "../stores/auth";
import { StatusBadge } from "../components/StatusBadge";
import { logger } from "@/lib/logger";
import { SigapCard } from "@/components/design-system/Card";
import { ROLES, ROLE_LABELS } from "../lib/roles";
import { colors, extendedColors } from "../theme/tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = "users" | "unit" | "kategori";

interface UserFormData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

interface UserFormErrors {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
}

interface CategoryFormData {
  name: string;
  slug: string;
  icon: string;
  description: string;
  parent_id: string | null;
}

interface CategoryFormErrors {
  name?: string;
  slug?: string;
  general?: string;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

// ─── Icons ───────────────────────────────────────────────────────────────────

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

const PlusIcon = () => (
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
      d="M12 4v16m8-8H4"
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

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="4" r="3" stroke="currentColor" strokeWidth="2" />
    <path
      d="M1 13c0-3 2.5-5 6-5s6 2 6 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const BuildingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="1"
      y="4"
      width="12"
      height="9"
      rx="1"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M4 4V2M10 4V2M1 7h12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const CategoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M1 2h4l1 4H2a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1H9L8 1H2a1 1 0 00-1 1z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "users", label: "User", icon: <UserIcon /> },
  { id: "unit", label: "Unit", icon: <BuildingIcon /> },
  { id: "kategori", label: "Kategori", icon: <CategoryIcon /> },
];

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");

  const [editModal, setEditModal] = useState<{
    user: UserRow;
    role: UserRole;
  } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormData>({
    email: "",
    password: "",
    name: "",
    role: "ADMIN",
  });
  const [createErrors, setCreateErrors] = useState<UserFormErrors>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params: {
      page: number;
      limit: number;
      role?: string;
      search?: string;
    } = { page, limit };
    if (roleFilter) params.role = roleFilter;
    if (searchQuery) params.search = searchQuery;

    api
      .users(params)
      .then((res) => {
        setUsers(res.data ?? []);
        setTotal(res.pagination.total);
      })
      .catch((e) => {
        logger.error("Failed to fetch users", { error: e });
        setUsers([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page, roleFilter, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const validateCreate = (d: UserFormData): UserFormErrors => {
    const errs: UserFormErrors = {};
    if (!d.email.trim()) errs.email = "Email wajib diisi";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))
      errs.email = "Format email tidak valid";
    if (!d.password) errs.password = "Password wajib diisi";
    else if (d.password.length < 8)
      errs.password = "Password minimal 8 karakter";
    if (!d.name.trim()) errs.name = "Nama wajib diisi";
    else if (d.name.trim().length < 2) errs.name = "Nama minimal 2 karakter";
    return errs;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateCreate(createForm);
    setCreateErrors(errs);
    if (Object.keys(errs).length > 0) return;
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
        setShowCreate(false);
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

  const handleEditSave = async () => {
    if (!editModal) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await api.updateUser(editModal.user.id, { role: editModal.role });
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

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sigap-textPrimary">
            Kelola akun pengguna
          </h2>
          <p className="text-xs text-sigap-textTertiary mt-0.5">
            Atur akun dan peran pengguna agar setiap orang dapat menjalankan
            tugasnya. Periksa peran sebelum menyimpan perubahan akses.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
            setCreateSuccess(null);
          }}
          aria-label="Buat akun pengguna"
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-lg text-sm font-semibold text-white bg-sigap-primary hover:bg-primary-600 transition-colors shadow-btn focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
        >
          <PlusIcon />
          Buat akun
        </button>
      </div>

      {/* Filters */}
      <SigapCard padding={16}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="user-search"
              className="block text-xs font-semibold text-sigap-textTertiary mb-1.5"
            >
              Cari
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon />
              </div>
              <input
                id="user-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Nama atau email..."
                className="w-full pl-10 pr-4 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary transition-colors"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="user-role-filter"
              className="block text-xs font-semibold text-sigap-textTertiary mb-1.5"
            >
              Pilih peran
            </label>
            <select
              id="user-role-filter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as UserRole | "");
                setPage(1);
              }}
              className="w-full px-4 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary transition-colors"
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <SigapCard severity="primary" padding={16}>
          <div className="text-2xl font-bold text-primary-600">{total}</div>
          <div className="text-xs text-sigap-textTertiary mt-0.5">
            Jumlah akun
          </div>
        </SigapCard>
        <SigapCard status="info" padding={16}>
          <div className="text-2xl font-bold text-info-600">
            {users.filter((u) => !u.disabled).length ?? 0}
          </div>
          <div className="text-xs text-sigap-textTertiary mt-0.5">Active</div>
        </SigapCard>
        <SigapCard padding={16}>
          <div
            className="text-2xl font-bold"
            style={{ color: colors.textTertiary }}
          >
            {users.filter((u) => u.disabled).length ?? 0}
          </div>
          <div className="text-xs text-sigap-textTertiary mt-0.5">Inactive</div>
        </SigapCard>
      </div>

      {/* Table */}
      <SigapCard padding={0}>
        <div className="px-6 py-4 border-b border-sigap-border flex items-center justify-between">
          <h3 className="text-base font-bold text-sigap-textPrimary">
            Daftar akun
          </h3>
          <p className="text-sm text-sigap-textTertiary">{total} total</p>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sigap-textMuted">
            <div className="inline-flex items-center gap-2">
              <svg
                className="animate-spin w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Memuat...
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sigap-textMuted">
            Belum ada akun yang sesuai dengan pencarian. Ubah pencarian atau
            tambahkan akun baru.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-sigap-background border-b border-sigap-border">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                      Email
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                      Nama
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                      Role
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                      Status
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                      Dibuat
                    </th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50 transition-colors"
                    >
                      <td className="py-3.5 px-6 text-sigap-textMuted">
                        {u.email}
                      </td>
                      <td className="py-3.5 px-6 font-medium text-sigap-textPrimary">
                        {u.name}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-600">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        {u.disabled ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: colors.bgSurface,
                              color: colors.textTertiary,
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
                      <td className="py-3.5 px-6 text-sigap-textMuted">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="py-3.5 px-6">
                        <button
                          onClick={() =>
                            setEditModal({ user: u, role: u.role })
                          }
                          aria-label={`Edit user ${u.name}`}
                          className="inline-flex items-center justify-center w-11 h-11 min-h-11 rounded-lg text-sigap-textMuted hover:text-sigap-primary hover:bg-sigap-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                        >
                          <PencilIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SigapCard>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-sigap-border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border">
              <h3 className="text-lg font-bold text-sigap-textPrimary">
                Buat akun
              </h3>
              <button
                onClick={() => {
                  setShowCreate(false);
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
                aria-label="Tutup modal"
                className="inline-flex items-center justify-center w-11 h-11 min-h-11 text-sigap-textMuted hover:text-sigap-textPrimary transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
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
                    Nama <span style={{ color: colors.danger }}>*</span>
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                    style={{
                      borderColor: createErrors.name
                        ? colors.danger
                        : undefined,
                    }}
                    placeholder="Nama lengkap"
                  />
                  {createErrors.name && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: colors.danger }}
                    >
                      {createErrors.name}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="create-email"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Email <span style={{ color: colors.danger }}>*</span>
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                    style={{
                      borderColor: createErrors.email
                        ? colors.danger
                        : undefined,
                    }}
                    placeholder="email@contoh.com"
                  />
                  {createErrors.email && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: colors.danger }}
                    >
                      {createErrors.email}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="create-password"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Password <span style={{ color: colors.danger }}>*</span>
                  </label>
                  <input
                    id="create-password"
                    type="password"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, password: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 rounded-lg border bg-sigap-background text-sm text-sigap-textPrimary placeholder-sigap-textMuted focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                    style={{
                      borderColor: createErrors.password
                        ? colors.danger
                        : undefined,
                    }}
                    placeholder="Minimal 8 karakter"
                  />
                  {createErrors.password && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: colors.danger }}
                    >
                      {createErrors.password}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="create-role"
                    className="block text-sm font-semibold text-sigap-textTertiary mb-1.5"
                  >
                    Role <span style={{ color: colors.danger }}>*</span>
                  </label>
                  <select
                    id="create-role"
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        role: e.target.value as UserRole,
                      }))
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-sigap-border bg-sigap-background text-sm text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary/30 focus:border-sigap-primary transition-colors"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {createErrors.role && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: colors.danger }}
                    >
                      {createErrors.role}
                    </p>
                  )}
                </div>
                {createError && (
                  <div
                    className="p-3 rounded-lg border text-sm"
                    style={{
                      backgroundColor: colors.dangerBg,
                      borderColor: extendedColors.dangerBorder,
                      color: colors.danger,
                    }}
                  >
                    {createError}
                  </div>
                )}
                {createSuccess && (
                  <div
                    className="p-3 rounded-lg border text-sm"
                    style={{
                      backgroundColor: colors.successBg,
                      borderColor: extendedColors.successBorder,
                      color: colors.success,
                    }}
                  >
                    {createSuccess}
                  </div>
                )}
              </form>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-surface">
              <button
                onClick={() => {
                  setShowCreate(false);
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

      {/* Edit Modal */}
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
                aria-label="Tutup modal"
                className="inline-flex items-center justify-center w-11 h-11 min-h-11 text-sigap-textMuted hover:text-sigap-textPrimary transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
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
                <p className="text-sm" style={{ color: colors.danger }}>
                  {editError}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sigap-border bg-sigap-surface">
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditError(null);
                }}
                className="px-4 py-2 rounded-lg border border-sigap-border text-sm font-medium text-sigap-textTertiary hover:bg-sigap-background transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sigap-primary hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {editSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unit Tab ─────────────────────────────────────────────────────────────────

interface AdminDashboardUnit {
  id: string;
  nama: string;
  alamat: string | null;
  kontak: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function UnitTab() {
  const [units, setUnits] = useState<AdminDashboardUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .units()
      .then((res) => setUnits(res.items))
      .catch((e) => {
        logger.error("Failed to fetch units", { error: e });
        setUnits([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sigap-textPrimary">
            Kelola unit kerja
          </h2>
          <p className="text-xs text-sigap-textTertiary mt-0.5">
            Atur unit yang menerima penugasan. Gunakan nama dan kontak yang
            jelas agar admin dapat menghubungi penanggung jawab.
          </p>
        </div>
      </div>

      <SigapCard padding={0}>
        <div className="px-6 py-4 border-b border-sigap-border flex items-center justify-between">
          <h3 className="text-base font-bold text-sigap-textPrimary">
            Daftar Unit
          </h3>
          <p className="text-sm text-sigap-textTertiary">
            {units?.length ?? 0} total
          </p>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sigap-textMuted">
            <div className="inline-flex items-center gap-2">
              <svg
                className="animate-spin w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Memuat...
            </div>
          </div>
        ) : (units?.length ?? 0) === 0 ? (
          <div className="px-6 py-12 text-center text-sigap-textMuted">
            Tidak ada data unit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-sigap-background border-b border-sigap-border">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                    Nama
                  </th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                    Tipe
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50 transition-colors"
                  >
                    <td className="py-3.5 px-6 font-medium text-sigap-textPrimary">
                      {u.nama}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-600">
                        {u.alamat ?? "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SigapCard>
    </div>
  );
}

// ─── Kategori Tab ─────────────────────────────────────────────────────────────

const emptyCategoryForm: CategoryFormData = {
  name: "",
  slug: "",
  icon: "",
  description: "",
  parent_id: null,
};

function KategoriTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(emptyCategoryForm);
  const [formErrors, setFormErrors] = useState<CategoryFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCategories = useCallback(() => {
    setLoading(true);
    api
      .categories()
      .then((data) => setCategories(data.data))
      .catch((e) => {
        logger.error("Failed to fetch categories", { error: e });
        setError("Gagal memuat kategori");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreate = () => {
    setEditingCategory(null);
    setFormData(emptyCategoryForm);
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon ?? "",
      description: cat.description ?? "",
      parent_id: cat.parent_id,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    setFormData(emptyCategoryForm);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errs: CategoryFormErrors = {};
    if (!formData.name.trim()) errs.name = "Nama kategori wajib diisi";
    if (!formData.slug.trim()) errs.slug = "Slug wajib diisi";
    else if (!/^[a-z0-9-]+$/.test(formData.slug))
      errs.slug = "Slug hanya huruf kecil, angka, dan strip";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setFormErrors({});
    const body = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      ...(formData.icon.trim() && { icon: formData.icon.trim() }),
      ...(formData.description.trim() && {
        description: formData.description.trim(),
      }),
      ...(formData.parent_id && { parent_id: formData.parent_id }),
      ...(!formData.parent_id && { parent_id: null }),
    };
    try {
      if (editingCategory) {
        const updated = await api.updateCategory(editingCategory.id, body);
        setCategories((prev) =>
          prev.map((c) => (c.id === editingCategory.id ? updated : c)),
        );
      } else {
        const created = await api.createCategory(body);
        setCategories((prev) => [...prev, created]);
      }
      closeModal();
    } catch (err: unknown) {
      logger.error("Failed to save category", { error: err });
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan kategori";
      setFormErrors({ general: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const prev = categories;
    setCategories((c) => c.filter((x) => x.id !== deleteTarget.id));
    try {
      await api.deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: unknown) {
      logger.error("Failed to delete category", { error: err });
      setCategories(prev);
      const msg =
        err instanceof Error ? err.message : "Gagal menghapus kategori";
      if (
        msg.toLowerCase().includes("409") ||
        msg.toLowerCase().includes("report")
      ) {
        setError(
          "Kategori tidak dapat dihapus karena masih digunakan oleh laporan.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleNameChange = (value: string) => {
    const currentSlug = formData.slug;
    const currentSlugMatchesName = currentSlug === slugify(formData.name);
    setFormData((prev) => ({
      ...prev,
      name: value,
      ...(currentSlug === "" || currentSlugMatchesName
        ? { slug: slugify(value) }
        : {}),
    }));
  };

  const parentOptions = categories.filter((c) => c.id !== editingCategory?.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sigap-textPrimary">
            Kelola jenis laporan
          </h2>
          <p className="text-xs text-sigap-textTertiary mt-0.5">
            Atur kategori agar warga dapat memilih jenis fasilitas dan petugas
            menerima daftar pemeriksaan yang sesuai.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-sigap-primary hover:bg-primary-600 transition-colors shadow-btn"
        >
          <PlusIcon />
          Tambah Kategori
        </button>
      </div>

      {error && (
        <div
          className="mb-4 p-4 rounded-lg border text-sm flex items-center justify-between"
          style={{
            backgroundColor: colors.dangerBg,
            borderColor: extendedColors.dangerBorder,
            color: colors.danger,
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Tutup pesan error"
            className="font-bold ml-4 min-h-11"
          >
            ×
          </button>
        </div>
      )}

      <SigapCard padding={0}>
        <div className="px-6 py-4 border-b border-sigap-border flex items-center justify-between">
          <h3 className="text-base font-bold text-sigap-textPrimary">
            Daftar Kategori
          </h3>
          <p className="text-sm text-sigap-textTertiary">
            {categories?.length ?? 0} total
          </p>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sigap-textMuted">
            <div className="inline-flex items-center gap-2">
              <svg
                className="animate-spin w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Memuat...
            </div>
          </div>
        ) : (categories?.length ?? 0) === 0 ? (
          <div className="px-6 py-12 text-center text-sigap-textMuted">
            Tidak ada kategori.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-sigap-background border-b border-sigap-border">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                    Nama / kode kategori
                  </th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                    Deskripsi
                  </th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                    Tipe
                  </th>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-sigap-textTertiary">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="border-b border-sigap-border last:border-0 hover:bg-sigap-background/50 transition-colors"
                  >
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2">
                        {cat.icon ? (
                          <span className="text-lg">{cat.icon}</span>
                        ) : (
                          <span className="w-5 h-5 rounded bg-sigap-background flex items-center justify-center text-sigap-textMuted text-xs">
                            -
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-sigap-textPrimary">
                            {cat.name}
                          </p>
                          <p className="text-xs text-sigap-textMuted font-mono">
                            {cat.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-sigap-textMuted max-w-[200px]">
                      {cat.description ? (
                        <p className="truncate" title={cat.description}>
                          {cat.description}
                        </p>
                      ) : (
                        <span className="text-sigap-textMuted">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      {cat.parent_id ? (
                        <span className="text-xs text-sigap-primary bg-sigap-primary/10 px-2 py-0.5 rounded">
                          Sub-kategori
                        </span>
                      ) : (
                        <span className="text-xs text-sigap-textMuted">
                          Kategori Utama
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEdit(cat)}
                          aria-label={`Edit kategori ${cat.name}`}
                          className="min-h-11 text-xs font-medium text-sigap-primary hover:underline focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(cat)}
                          aria-label={`Hapus kategori ${cat.name}`}
                          className="min-h-11 text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-offset-2"
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
        )}
      </SigapCard>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sigap-surface rounded-xl border border-sigap-border shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border sticky top-0 bg-sigap-surface">
              <h3 className="font-semibold">
                {editingCategory ? "Edit Kategori" : "Tambah Kategori"}
              </h3>
              <button
                onClick={closeModal}
                aria-label="Tutup modal"
                className="inline-flex items-center justify-center w-11 h-11 min-h-11 text-sigap-textMuted hover:text-sigap-text transition-colors text-lg font-bold focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formErrors.general && (
                <div
                  className="p-3 rounded border text-sm"
                  style={{
                    backgroundColor: colors.dangerBg,
                    borderColor: extendedColors.dangerBorder,
                    color: colors.danger,
                  }}
                >
                  {formErrors.general}
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Nama Kategori <span style={{ color: colors.danger }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Contoh: Jalan Rusak"
                  className="w-full px-3 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary"
                />
                {formErrors.name && (
                  <p className="text-xs" style={{ color: colors.danger }}>
                    {formErrors.name}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Slug <span style={{ color: colors.danger }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        slug: e.target.value.toLowerCase(),
                      }))
                    }
                    placeholder="contoh: jalan-rusak"
                    className="w-full px-3 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary pr-16"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((p) => ({ ...p, slug: slugify(p.name) }))
                    }
                    aria-label="Buat ulang dari nama slug"
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-11 flex items-center text-xs text-sigap-primary hover:underline focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                  >
                    Buat ulang dari nama
                  </button>
                </div>
                {formErrors.slug && (
                  <p className="text-xs" style={{ color: colors.danger }}>
                    {formErrors.slug}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Kategori Induk
                </label>
                <select
                  value={formData.parent_id ?? ""}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      parent_id: e.target.value || null,
                    }))
                  }
                  className="w-full px-3 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary"
                >
                  <option value="">Tidak ada (Kategori Utama)</option>
                  {parentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Icon
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, icon: e.target.value }))
                    }
                    placeholder="Contoh: 🚧"
                    className="flex-1 px-3 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary"
                  />
                  <div className="flex items-center justify-center w-11 h-11 rounded border border-sigap-border bg-white text-lg">
                    {formData.icon || "-"}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Deskripsi
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Deskripsi opsional..."
                  rows={3}
                  className="w-full px-3 py-2.5 min-h-11 rounded-lg border border-sigap-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:border-sigap-primary resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 min-h-11 rounded-lg text-sm font-medium border border-sigap-border hover:bg-sigap-background transition-colors focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 min-h-11 rounded-lg text-sm font-medium text-white bg-sigap-primary hover:bg-primary-600 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                >
                  {submitting
                    ? "Menyimpan..."
                    : editingCategory
                      ? "Simpan"
                      : "Buat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sigap-surface rounded-xl border border-sigap-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="font-semibold text-lg mb-2">Hapus Kategori?</h3>
              <p className="text-sm text-sigap-textMuted mb-6">
                Apakah Anda yakin ingin menghapus kategori{" "}
                <strong className="text-sigap-text">{deleteTarget.name}</strong>
                ? Aplikasi akan menghapus kategori dari pilihan untuk laporan
                baru. Periksa pilihan ini sebelum melanjutkan.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2 min-h-11 rounded-lg text-sm font-medium border border-sigap-border hover:bg-sigap-background transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 min-h-11 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ backgroundColor: colors.danger }}
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
}

// ─── Scoring Formula Card ─────────────────────────────────────────────────────

function ScoringFormulaCard() {
  return (
    <SigapCard padding={20}>
      <h3 className="text-sm font-bold mb-2">Atur perhitungan prioritas</h3>
      <p className="text-sm mb-3">
        Tinjau rumus yang sedang digunakan sebelum mengubah bobot penilaian.
        Halaman pengaturan prioritas menampilkan versi dan komponen dari data
        yang tersimpan, sehingga perubahan tidak dimulai dari angka contoh.
      </p>
      <Link className="ref-button" to="/system/priority">
        Buka pengaturan prioritas
      </Link>
    </SigapCard>
  );
}
// ─── Main Settings (Administrasi) ─────────────────────────────────────────────

export const Settings = () => {
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-[100dvh] bg-sigap-surface">
      {/* Page Header */}
      <div className="border-b border-sigap-border bg-white px-6 py-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-sigap-textPrimary">
              Administrasi
            </h1>
            <p className="text-sm text-sigap-textMuted mt-0.5">
              Kelola akun, unit, kategori, dan rumus prioritas dari data yang
              tersimpan.
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 mb-6">
        <h2 className="text-sm font-semibold text-sigap-textTertiary mb-3">
          Ruang administrasi
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: "Kategori",
              path: "/system/categories",
              desc: "Kelola kategori laporan",
            },
            {
              label: "Unit",
              path: "/system/units",
              desc: "Kelola unit petugas",
            },
            {
              label: "Prioritas",
              path: "/system/priority",
              desc: "Konfigurasi skor prioritas",
            },
            {
              label: "Dashboard Regional",
              path: "/system/regional",
              desc: "Statistik & SLA daerah",
            },
            {
              label: "Pengaturan",
              path: "/system/settings",
              desc: "Pengaturan sistem",
            },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="block p-3 rounded-xl border border-sigap-border bg-white hover:border-sigap-primary hover:shadow-sm transition-all group"
            >
              <p className="text-sm font-semibold text-sigap-textPrimary group-hover:text-sigap-primary transition-colors">
                {item.label}
              </p>
              <p className="text-xs text-sigap-textMuted mt-0.5">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="px-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScoringFormulaCard />
        <SigapCard padding={20}>
          <h3
            className="text-sm font-bold mb-3"
            style={{ color: colors.textPrimary }}
          >
            Akun yang melakukan perubahan
          </h3>
          <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
            {user?.name ?? "Admin"} &middot; Administrator
            <br />
            Gunakan akun ini untuk mengelola data sesuai kewenangan
            administrator.
          </p>
          <div
            className="px-3 py-2 rounded-lg text-xs mb-4"
            style={{
              backgroundColor: extendedColors.bgSoft,
              color: colors.textTertiary,
            }}
          >
            Perubahan pada formulir mengubah data sistem setelah Anda
            menyimpannya. Periksa akun, unit, atau kategori yang Anda pilih
            sebelum melanjutkan.
          </div>
        </SigapCard>
      </div>

      <div className="px-6 mb-6">
        <SigapCard padding={20}>
          <h3
            className="text-sm font-bold mb-3"
            style={{ color: colors.textPrimary }}
          >
            Tautan Cepat
          </h3>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/system/priority"
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-sigap-border hover:border-sigap-primary hover:text-sigap-primary transition-colors"
              style={{ color: colors.textSecondary }}
            >
              Konfigurasi Formula Prioritas
            </Link>
            <Link
              to="/system/units"
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-sigap-border hover:border-sigap-primary hover:text-sigap-primary transition-colors"
              style={{ color: colors.textSecondary }}
            >
              Kelola Unit Petugas
            </Link>
            <Link
              to="/system/categories"
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-sigap-border hover:border-sigap-primary hover:text-sigap-primary transition-colors"
              style={{ color: colors.textSecondary }}
            >
              Kelola Kategori
            </Link>
            <Link
              to="/system/regional"
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-sigap-border hover:border-sigap-primary hover:text-sigap-primary transition-colors"
              style={{ color: colors.textSecondary }}
            >
              Dashboard Regional
            </Link>
          </div>
        </SigapCard>
      </div>

      {/* Tab Bar */}
      <div className="px-6 mb-6">
        <div className="flex items-center gap-1 p-1 bg-sigap-background rounded-xl w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={`Tab ${tab.label}`}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`inline-flex items-center gap-2 px-4 py-2 min-h-11 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-sigap-primary focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? "bg-sigap-primary text-white shadow-sm"
                  : "text-sigap-textSecondary hover:bg-sigap-surface hover:text-sigap-textPrimary"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 pb-8">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "unit" && <UnitTab />}
        {activeTab === "kategori" && <KategoriTab />}
      </div>
    </div>
  );
};
