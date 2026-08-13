import { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client";
import type { Category, AuditLogEntry } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

interface CategoryFormData {
  name: string;
  slug: string;
  icon: string;
  description: string;
  parent_id: string | null;
}

interface FormErrors {
  name?: string;
  slug?: string;
  parent_id?: string;
  general?: string;
}

const emptyForm: CategoryFormData = {
  name: "",
  slug: "",
  icon: "",
  description: "",
  parent_id: null,
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

interface TreeCategory extends Category {
  children: TreeCategory[];
  level: number;
}

const buildTree = (categories: Category[]): TreeCategory[] => {
  const map = new Map<string, TreeCategory>();
  const roots: TreeCategory[] = [];

  categories.forEach((cat) => {
    map.set(cat.id, { ...cat, children: [], level: 0 });
  });

  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

const flattenTree = (tree: TreeCategory[]): TreeCategory[] => {
  const result: TreeCategory[] = [];
  const traverse = (nodes: TreeCategory[]) => {
    nodes.forEach((node) => {
      result.push(node);
      traverse(node.children);
    });
  };
  traverse(tree);
  return result;
};

const JsonView = ({ data }: { data: unknown }) => {
  const [expanded, setExpanded] = useState(false);
  const jsonStr = JSON.stringify(data, null, 2);
  const isLong = jsonStr.length > 200;

  if (!isLong) {
    return <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto">{jsonStr}</pre>;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-sigap-primary hover:underline"
      >
        {expanded ? "Sembunyikan" : "Lihat"} JSON
      </button>
      {expanded && (
        <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto mt-1">{jsonStr}</pre>
      )}
    </div>
  );
};

const AuditRow = ({ entry }: { entry: AuditLogEntry }) => {
  const [showDetails, setShowDetails] = useState(false);
  const actionColors: Record<string, string> = {
    category_create: "bg-green-100 text-green-700",
    category_update: "bg-blue-100 text-blue-700",
    category_delete: "bg-red-100 text-red-700",
  };

  return (
    <div className="border-b border-sigap-border last:border-0 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${actionColors[entry.action] ?? "bg-gray-100 text-gray-700"}`}>
              {entry.action.replace("category_", "")}
            </span>
            <span className="text-xs text-sigap-textMuted">
              {new Date(entry.created_at).toLocaleString("id-ID")}
            </span>
            {entry.actor && (
              <span className="text-xs text-sigap-textMuted font-mono">
                {entry.actor.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-sigap-primary hover:underline shrink-0"
        >
          {showDetails ? "Sembunyikan" : "Detail"}
        </button>
      </div>
      {showDetails && (
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="font-medium text-sigap-textMuted">Before:</span>
            <JsonView data={entry.before} />
          </div>
          <div>
            <span className="font-medium text-sigap-textMuted">After:</span>
            <JsonView data={entry.after} />
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryRow = ({
  category,
  onEdit,
  onDelete,
  onViewAudit,
  isLast,
}: {
  category: TreeCategory;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onViewAudit: (cat: Category) => void;
  isLast: boolean;
}) => {
  const indent = category.level * 24;

  return (
    <tr className={`border-b border-sigap-border hover:bg-sigap-background/50 ${isLast ? "border-b-0" : ""}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2" style={{ paddingLeft: `${indent}px` }}>
          {category.level > 0 && (
            <span className="absolute left-0 w-px h-4 bg-sigap-border" style={{ left: `${indent - 12}px` }} />
          )}
          {category.icon ? (
            <span className="text-lg">{category.icon}</span>
          ) : (
            <span className="w-5 h-5 rounded bg-sigap-background flex items-center justify-center text-sigap-textMuted text-xs">
              -
            </span>
          )}
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{category.name}</p>
            <p className="text-xs text-sigap-textMuted font-mono truncate">{category.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-sigap-textMuted max-w-[200px]">
        {category.description ? (
          <p className="truncate" title={category.description}>{category.description}</p>
        ) : (
          <span className="text-sigap-textMuted">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {category.parent_id ? (
          <span className="text-xs text-sigap-primary bg-sigap-primary/10 px-2 py-0.5 rounded">
            Sub-kategori
          </span>
        ) : (
          <span className="text-xs text-sigap-textMuted">Kategori Utama</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onViewAudit(category)}
            className="text-xs text-sigap-textMuted hover:text-sigap-primary hover:underline"
            title="Lihat Riwayat"
          >
            Audit
          </button>
          <button
            onClick={() => onEdit(category)}
            className="text-xs font-medium text-sigap-primary hover:underline"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(category)}
            className="text-xs font-medium text-red-500 hover:underline"
          >
            Hapus
          </button>
        </div>
      </td>
    </tr>
  );
};

export const AdminCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [auditTarget, setAuditTarget] = useState<Category | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  const user = useAuthStore((s) => s.user);

  const loadCategories = useCallback(() => {
    setLoading(true);
    api
      .categories()
      .then((data) => setCategories(data.categories))
      .catch((e) => { logger.error("Failed to fetch categories", { error: e }); setError("Gagal memuat kategori"); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadAuditEntries = useCallback((categoryId: string) => {
    setAuditLoading(true);
    api
      .auditSearch({ limit: 20 } as Parameters<typeof api.auditSearch>[0])
      .then((data) => setAuditEntries(data.entries.filter((e) => e.object_type === "category" && e.object_id === categoryId)))
      .catch((e) => { logger.error("Failed to fetch audit entries", { error: e }); setAuditEntries([]); })
      .finally(() => setAuditLoading(false));
  }, []);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData(emptyForm);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (cat: Category) => {
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
    setFormData(emptyForm);
    setFormErrors({});
  };

  const openAuditPanel = (cat: Category) => {
    setAuditTarget(cat);
    setShowAuditPanel(true);
    loadAuditEntries(cat.id);
  };

  const closeAuditPanel = () => {
    setShowAuditPanel(false);
    setAuditTarget(null);
    setAuditEntries([]);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    if (!formData.name.trim()) {
      errors.name = "Nama kategori wajib diisi";
    }
    if (!formData.slug.trim()) {
      errors.slug = "Slug wajib diisi";
    } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      errors.slug = "Slug hanya boleh berisi huruf kecil, angka, dan strip";
    }
    if (formData.parent_id === editingCategory?.id) {
      errors.parent_id = "Kategori tidak dapat menjadi parent dari dirinya sendiri";
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
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      ...(formData.icon.trim() && { icon: formData.icon.trim() }),
      ...(formData.description.trim() && { description: formData.description.trim() }),
      ...(formData.parent_id && { parent_id: formData.parent_id }),
      ...(!formData.parent_id && { parent_id: null }),
    };

    try {
      if (editingCategory) {
        const previous = categories;
        setCategories((prev) =>
          prev.map((c) => (c.id === editingCategory.id ? { ...c, ...body } : c))
        );
        try {
          const updated = await api.updateCategory(editingCategory.id, body);
          setCategories((prev) =>
            prev.map((c) => (c.id === editingCategory.id ? updated : c))
          );
        } catch (err) {
          setCategories(previous);
          throw err;
        }
      } else {
        const tempId = `temp-${Date.now()}`;
        const tempCat: Category = {
          id: tempId,
          slug: body.slug,
          name: body.name,
          icon: body.icon ?? null,
          description: body.description ?? null,
          parent_id: body.parent_id ?? null,
          created_at: new Date().toISOString(),
        };
        setCategories((prev) => [...prev, tempCat]);
        try {
          const created = await api.createCategory(body);
          setCategories((prev) => prev.map((c) => (c.id === tempId ? created : c)));
        } catch (err) {
          setCategories((prev) => prev.filter((c) => c.id !== tempId));
          throw err;
        }
      }
      closeModal();
    } catch (err: unknown) {
      logger.error("Failed to save category", { error: err });
      const msg = err instanceof Error ? err.message : "Gagal menyimpan kategori";
      setFormErrors({ general: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const previous = categories;
    setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    try {
      await api.deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: unknown) {
      logger.error("Failed to delete category", { error: err });
      setCategories(previous);
      const msg = err instanceof Error ? err.message : "Gagal menghapus kategori";
      if (msg.toLowerCase().includes("409") || msg.toLowerCase().includes("report")) {
        setError("Kategori tidak dapat dihapus karena masih digunakan oleh laporan.");
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
      ...(currentSlug === "" || currentSlugMatchesName ? { slug: slugify(value) } : {}),
    }));
  };

  const tree = buildTree(categories);
  const flatCategories = flattenTree(tree);

  const parentOptions = categories.filter((c) => c.id !== editingCategory?.id);

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

      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Kategori</h2>
            <p className="text-sm text-sigap-textMuted">{categories.length} total</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: colors.primary }}
          >
            <span>+</span> Tambah Kategori
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold ml-4">×</button>
          </div>
        )}

        {loading ? (
          <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
        ) : categories.length === 0 ? (
          <p className="text-center text-sigap-textMuted py-8">
            Tidak ada kategori.
          </p>
        ) : (
          <div className="bg-sigap-surface rounded-lg border border-sigap-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sigap-background border-b border-sigap-border">
                  <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Nama / Slug</th>
                  <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Deskripsi</th>
                  <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Tipe</th>
                  <th className="text-left px-4 py-3 font-medium text-sigap-textMuted">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {flatCategories.map((cat, idx) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={openEditModal}
                    onDelete={setDeleteTarget}
                    onViewAudit={openAuditPanel}
                    isLast={idx === flatCategories.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sigap-surface rounded-xl border border-sigap-border shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border sticky top-0 bg-sigap-surface">
              <h3 className="font-semibold">
                {editingCategory ? "Edit Kategori" : "Tambah Kategori"}
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
                <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                  {formErrors.general}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Nama Kategori <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Contoh: Jalan Rusak"
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                />
                {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Slug <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                    placeholder="contoh: jalan-rusak"
                    className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, slug: slugify(prev.name) }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-sigap-primary hover:underline"
                  >
                    Regenerate
                  </button>
                </div>
                {formErrors.slug && <p className="text-xs text-red-500">{formErrors.slug}</p>}
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">
                  Kategori Induk
                </label>
                <select
                  value={formData.parent_id ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, parent_id: e.target.value || null }))}
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                >
                  <option value="">Tidak ada (Kategori Utama)</option>
                  {parentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                {formErrors.parent_id && <p className="text-xs text-red-500">{formErrors.parent_id}</p>}
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">Icon</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData((prev) => ({ ...prev, icon: e.target.value }))}
                    placeholder="Contoh: 🚧 atau nama icon"
                    className="flex-1 px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                  />
                  <div className="flex items-center justify-center w-10 h-10 rounded border border-sigap-border bg-sigap-background text-lg">
                    {formData.icon || "-"}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-sigap-textMuted">Deskripsi</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Deskripsi opsional..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 resize-none"
                />
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
                  {submitting ? "Menyimpan..." : editingCategory ? "Simpan" : "Buat"}
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
              <h3 className="font-semibold text-lg mb-2">Hapus Kategori?</h3>
              <p className="text-sm text-sigap-textMuted mb-6">
                Apakah Anda yakin ingin menghapus kategori{" "}
                <strong className="text-sigap-text">{deleteTarget.name}</strong>?
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
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuditPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-sigap-surface rounded-xl border border-sigap-border shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-sigap-border shrink-0">
              <div>
                <h3 className="font-semibold">Riwayat Audit</h3>
                <p className="text-sm text-sigap-textMuted">
                  {auditTarget?.name}
                </p>
              </div>
              <button
                onClick={closeAuditPanel}
                className="text-sigap-textMuted hover:text-sigap-text transition-colors text-lg font-bold"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {auditLoading ? (
                <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
              ) : auditEntries.length === 0 ? (
                <p className="text-center text-sigap-textMuted py-8">
                  Tidak ada riwayat audit untuk kategori ini.
                </p>
              ) : (
                <div className="space-y-0">
                  {auditEntries.map((entry) => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
