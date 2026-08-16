import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { UserRow, UserRole, WilayahNode } from "../../types";
import { useAuthStore } from "../../stores/auth";
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

const navItems = [
  { icon: "grid", label: "Ringkasan", path: "/admin" },
  { icon: "users", label: "Manajemen User", path: "/admin/users", active: true },
  { icon: "map", label: "Peta & Kasus", path: "/admin/cases" },
  { icon: "queue", label: "Antrean Verifikasi", path: "/admin/verifikator" },
];

const GridIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="1" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="4" r="3" stroke="currentColor" strokeWidth="2"/>
    <path d="M1 13c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const MapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1L13 4V10L7 13L1 10V4L7 1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

const QueueIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2"/>
  </svg>
);

const NavIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "grid": return <GridIcon />;
    case "users": return <UsersIcon />;
    case "map": return <MapIcon />;
    case "queue": return <QueueIcon />;
    default: return <GridIcon />;
  }
};

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
    <div className="flex min-h-[100dvh] bg-[#f9faf8]">
      {/* Sidebar */}
      <aside className="w-[220px] bg-[#16302b] text-[#cfe4df] flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4 pb-5">
          <div className="w-8 h-8 rounded-lg bg-[#0f7a6b] flex items-center justify-center text-white font-bold text-base">
            P
          </div>
          <span className="text-base font-bold text-white">PantauDesa</span>
        </div>

        <nav className="px-3 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? "bg-[#0f7a6b] text-white"
                  : "hover:bg-[#234a43] text-[#cfe4df]"
              }`}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-4 border-t border-[#234a43]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#9dc0b9]">
            <span className="w-8 h-8 rounded-full bg-[#0f7a6b] flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.slice(0, 2).toUpperCase() ?? "AD"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-white">{user?.name ?? "Admin"}</div>
              <div className="text-[10px] text-[#9dc0b9] truncate">{user?.role ?? "ADMIN"}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-[#e4e7e2] flex items-center gap-4 px-6 shrink-0 bg-white">
          <div className="max-w-[360px] flex-1 bg-[#f4f5f3] border border-[#e4e7e2] rounded-lg px-3 py-2 flex items-center gap-2">
            <SearchIcon />
            <span className="text-xs text-[#8a9099]">Cari users...</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#eef0ec] flex items-center justify-center text-xs font-bold text-[#0a5c50]">
              {user?.name?.slice(0, 2).toUpperCase() ?? "AD"}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5">
          {/* Page Title */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#17191c]">Manajemen User</h2>
              <p className="text-xs text-[#616770] mt-0.5">Kelola pengguna sistem dan hak akses</p>
            </div>
            <button
              onClick={() => {
                setShowCreateModal(true);
                setCreateError(null);
                setCreateSuccess(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#0f7a6b] hover:bg-[#0a5c50] transition-colors shadow-btn"
            >
              <UserPlusIcon />
              Buat User
            </button>
          </div>

          {/* Filters Card */}
          <div className="bg-white border border-[#e4e7e2] rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="search-filter" className="block text-xs font-semibold text-[#616770] mb-1.5">
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
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#e4e7e2] bg-[#f4f5f3] text-sm text-[#17191c] placeholder-[#8a9099] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="role-filter" className="block text-xs font-semibold text-[#616770] mb-1.5">
                  Filter Role
                </label>
                <select
                  id="role-filter"
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value as UserRole | "");
                    setPage(1);
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-[#e4e7e2] bg-[#f4f5f3] text-sm text-[#17191c] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors"
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

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#0f7a6b] rounded-xl p-4">
              <div className="text-2xl font-bold text-[#0a5c50]">{total}</div>
              <div className="text-xs text-[#616770] mt-0.5">Total User</div>
            </div>
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#2563eb] rounded-xl p-4">
              <div className="text-2xl font-bold text-[#1d4ed8]">{users.filter(u => !u.disabled).length}</div>
              <div className="text-xs text-[#616770] mt-0.5">Active</div>
            </div>
            <div className="bg-white border border-[#e4e7e2] border-t-[3px] border-t-[#8a9099] rounded-xl p-4">
              <div className="text-2xl font-bold text-[#616770]">{users.filter(u => u.disabled).length}</div>
              <div className="text-xs text-[#616770] mt-0.5">Inactive</div>
            </div>
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-xl border border-[#e4e7e2] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e4e7e2] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#17191c]">Daftar User</h3>
              <p className="text-sm text-[#616770]">{total} total</p>
            </div>

            {loading ? (
              <div className="px-6 py-12 text-center">
                <div className="inline-flex items-center gap-2 text-[#8a9099]">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Memuat...
                </div>
              </div>
            ) : users.length === 0 ? (
              <div className="px-6 py-12 text-center text-[#8a9099]">Tidak ada data user.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="bg-[#f4f5f3] border-b border-[#e4e7e2]">
                        <th className="text-left py-3 px-6 text-xs font-semibold text-[#616770]">Email</th>
                        <th className="text-left py-3 px-6 text-xs font-semibold text-[#616770]">Nama</th>
                        <th className="text-left py-3 px-6 text-xs font-semibold text-[#616770]">Role</th>
                        <th className="text-left py-3 px-6 text-xs font-semibold text-[#616770]">Status</th>
                        <th className="text-left py-3 px-6 text-xs font-semibold text-[#616770]">Dibuat</th>
                        <th className="text-left py-3 px-6 text-xs font-semibold text-[#616770]">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u.id}
                          className="border-b border-[#e4e7e2] last:border-0 hover:bg-[#f4f5f3]/50 transition-colors"
                        >
                          <td className="py-3.5 px-6 text-[#8a9099]">{u.email}</td>
                          <td className="py-3.5 px-6 font-medium text-[#17191c]">{u.name}</td>
                          <td className="py-3.5 px-6">
                            <span
                              className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{ backgroundColor: "#0f7a6b20", color: "#0a5c50" }}
                            >
                              {ROLE_LABELS[u.role] ?? u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-6">
                            {u.disabled ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                style={{ backgroundColor: "#8a909920", color: "#616770" }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#8a9099]" />
                                Inactive
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                                style={{ backgroundColor: "#22c55e20", color: "#16a34a" }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-6 text-[#8a9099]">{formatDate(u.created_at)}</td>
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditOpen(u)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#8a9099] hover:text-[#0f7a6b] hover:bg-[#0f7a6b]/10 transition-colors"
                                title="Edit"
                              >
                                <PencilIcon />
                              </button>

                              {u.disabled ? (
                                <button
                                  onClick={() => handleConfirmOpen(u, "reactivate")}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#8a9099] hover:text-[#22c55e] hover:bg-[#22c55e]/10 transition-colors"
                                  title="Aktifkan"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleConfirmOpen(u, "deactivate")}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#8a9099] hover:text-[#b8730a] hover:bg-[#b8730a]/10 transition-colors"
                                  title="Nonaktifkan"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                  </svg>
                                </button>
                              )}

                              <button
                                onClick={() => handleConfirmOpen(u, "delete")}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#8a9099] hover:text-[#c0392b] hover:bg-[#c0392b]/10 transition-colors"
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
                  <div className="px-6 py-4 border-t border-[#e4e7e2] flex items-center justify-between">
                    <p className="text-sm text-[#616770]">
                      Menampilkan {users.length} dari {total} data
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg border border-[#e4e7e2] text-sm text-[#616770] hover:bg-[#f4f5f3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Prev
                      </button>
                      <span className="text-sm text-[#616770] px-2">
                        Halaman {page} dari {totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 rounded-lg border border-[#e4e7e2] text-sm text-[#616770] hover:bg-[#f4f5f3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#e4e7e2] w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e4e7e2]">
              <h3 className="text-lg font-bold text-[#17191c]">Buat User</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setCreateForm({ email: "", password: "", name: "", role: "VERIFIKATOR", wilayah_id: null });
                  setCreateErrors({});
                }}
                className="text-[#8a9099] hover:text-[#17191c] transition-colors"
              >
                <XIcon />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form id="create-user-form" onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label htmlFor="create-name" className="block text-sm font-semibold text-[#616770] mb-1.5">
                    Nama <span className="text-[#c0392b]">*</span>
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-lg border bg-[#f4f5f3] text-sm text-[#17191c] placeholder-[#8a9099] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors ${
                      createErrors.name ? "border-[#c0392b]" : "border-[#e4e7e2]"
                    }`}
                    placeholder="Nama lengkap"
                  />
                  {createErrors.name && (
                    <p className="text-xs text-[#c0392b] mt-1">{createErrors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-email" className="block text-sm font-semibold text-[#616770] mb-1.5">
                    Email <span className="text-[#c0392b]">*</span>
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-lg border bg-[#f4f5f3] text-sm text-[#17191c] placeholder-[#8a9099] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors ${
                      createErrors.email ? "border-[#c0392b]" : "border-[#e4e7e2]"
                    }`}
                    placeholder="email@contoh.com"
                  />
                  {createErrors.email && (
                    <p className="text-xs text-[#c0392b] mt-1">{createErrors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-password" className="block text-sm font-semibold text-[#616770] mb-1.5">
                    Password <span className="text-[#c0392b]">*</span>
                  </label>
                  <input
                    id="create-password"
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-lg border bg-[#f4f5f3] text-sm text-[#17191c] placeholder-[#8a9099] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors ${
                      createErrors.password ? "border-[#c0392b]" : "border-[#e4e7e2]"
                    }`}
                    placeholder="Minimal 8 karakter"
                  />
                  {createErrors.password && (
                    <p className="text-xs text-[#c0392b] mt-1">{createErrors.password}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-role" className="block text-sm font-semibold text-[#616770] mb-1.5">
                    Role <span className="text-[#c0392b]">*</span>
                  </label>
                  <select
                    id="create-role"
                    value={createForm.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className={`w-full px-4 py-2.5 rounded-lg border bg-[#f4f5f3] text-sm text-[#17191c] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors ${
                      createErrors.role ? "border-[#c0392b]" : "border-[#e4e7e2]"
                    }`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {createErrors.role && (
                    <p className="text-xs text-[#c0392b] mt-1">{createErrors.role}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-wilayah" className="block text-sm font-semibold text-[#616770] mb-1.5">
                    Wilayah Scope{" "}
                    {WILAYAH_SCOPED_ROLES.includes(createForm.role) && (
                      <span className="text-[#c0392b]">*</span>
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
                    className={`w-full px-4 py-2.5 rounded-lg border bg-[#f4f5f3] text-sm text-[#17191c] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors ${
                      createErrors.wilayah_id ? "border-[#c0392b]" : "border-[#e4e7e2]"
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
                    <p className="text-xs text-[#c0392b] mt-1">{createErrors.wilayah_id}</p>
                  )}
                  {!WILAYAH_SCOPED_ROLES.includes(createForm.role) && (
                    <p className="text-xs text-[#8a9099] mt-1">
                      Role ini tidak menggunakan scope wilayah
                    </p>
                  )}
                </div>

                {createError && (
                  <div className="p-3 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-sm text-[#c0392b]">
                    {createError}
                  </div>
                )}

                {createSuccess && (
                  <div className="p-3 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-sm text-[#16a34a]">
                    {createSuccess}
                  </div>
                )}
              </form>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e4e7e2] bg-[#f9faf8]">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                  setCreateSuccess(null);
                  setCreateForm({ email: "", password: "", name: "", role: "VERIFIKATOR", wilayah_id: null });
                  setCreateErrors({});
                }}
                className="px-4 py-2 rounded-lg border border-[#e4e7e2] text-sm font-medium text-[#616770] hover:bg-[#f4f5f3] transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                form="create-user-form"
                disabled={createSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0f7a6b] hover:bg-[#0a5c50] disabled:opacity-50 transition-colors"
              >
                {createSubmitting ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-[#e4e7e2] w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e4e7e2]">
              <h3 className="text-lg font-bold text-[#17191c]">Edit User</h3>
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditError(null);
                }}
                className="text-[#8a9099] hover:text-[#17191c] transition-colors"
              >
                <XIcon />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-[#8a9099] mb-1">Nama</p>
                <p className="text-sm font-semibold text-[#17191c]">{editModal.user.name}</p>
              </div>
              <div>
                <p className="text-xs text-[#8a9099] mb-1">Email</p>
                <p className="text-sm font-semibold text-[#17191c]">{editModal.user.email}</p>
              </div>
              <div>
                <label htmlFor="edit-role" className="block text-sm font-semibold text-[#616770] mb-1.5">
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
                  className="w-full px-4 py-2.5 rounded-lg border border-[#e4e7e2] bg-[#f4f5f3] text-sm text-[#17191c] focus:outline-none focus:ring-2 focus:ring-[#0f7a6b]/30 focus:border-[#0f7a6b] transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p className="text-sm text-[#c0392b]">{editError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e4e7e2] bg-[#f9faf8]">
              <button
                onClick={() => {
                  setEditModal(null);
                  setEditError(null);
                }}
                className="px-4 py-2 rounded-lg border border-[#e4e7e2] text-sm font-medium text-[#616770] hover:bg-[#f4f5f3] transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0f7a6b] hover:bg-[#0a5c50] disabled:opacity-50 transition-colors"
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
          <div className="bg-white rounded-xl border border-[#e4e7e2] w-full max-w-sm">
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#17191c] mb-2">
                {confirmModal.action === "delete"
                  ? "Hapus User"
                  : confirmModal.action === "deactivate"
                  ? "Nonaktifkan User"
                  : "Aktifkan User"}
              </h3>
              <p className="text-sm text-[#616770]">
                {confirmModal.action === "delete"
                  ? `Apakah Anda yakin ingin menghapus ${confirmModal.user.name}? User tidak akan dapat login lagi.`
                  : confirmModal.action === "deactivate"
                  ? `Apakah Anda yakin ingin menonaktifkan ${confirmModal.user.name}?`
                  : `Apakah Anda yakin ingin mengaktifkan kembali ${confirmModal.user.name}?`}
              </p>
              {confirmError && (
                <p className="text-sm text-[#c0392b] mt-3">{confirmError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e4e7e2] bg-[#f9faf8]">
              <button
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmError(null);
                }}
                className="px-4 py-2 rounded-lg border border-[#e4e7e2] text-sm font-medium text-[#616770] hover:bg-[#f4f5f3] transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
                  confirmModal.action === "delete"
                    ? "bg-[#c0392b] hover:bg-[#a5271a]"
                    : confirmModal.action === "deactivate"
                    ? "bg-[#b8730a] hover:bg-[#8a5808]"
                    : "bg-[#0f7a6b] hover:bg-[#0a5c50]"
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
