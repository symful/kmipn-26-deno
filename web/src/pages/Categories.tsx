import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Category, AuditLogEntry } from "../types";
import { colors, extendedColors } from "../theme/tokens";
import { logger } from "@/lib/logger";
import { SigapCard } from "../components/design-system/Card";
import { EmptyState } from "../components/design-system/EmptyState";
import { ErrorRetry } from "../components/design-system/ErrorRetry";
import { Skeleton } from "../components/design-system/Skeleton";
import { CategoriesIcon } from "../theme/icons";
import { CategoryChecklistEditor } from "../components/CategoryChecklistEditor";

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
  const safeList = Array.isArray(categories) ? categories : [];

  safeList.forEach((cat) => {
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
    return (
      <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto">
        {jsonStr}
      </pre>
    );
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
        <pre className="text-xs font-mono bg-sigap-background p-2 rounded overflow-x-auto mt-1">
          {jsonStr}
        </pre>
      )}
    </div>
  );
};

const AuditRow = ({ entry }: { entry: AuditLogEntry }) => {
  const [showDetails, setShowDetails] = useState(false);
  const actionColors: Record<string, string> = {
    category_create: colors.successBg + " " + colors.success,
    category_update: colors.infoBg + " " + colors.info,
    category_delete: colors.dangerBg + " " + colors.danger,
  };

  return (
    <div className="border-b border-sigap-border last:border-0 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: (
                  actionColors[entry.action] ??
                  `${colors.bgSurface} ${colors.textTertiary}`
                ).split(" ")[0],
                color: (
                  actionColors[entry.action] ??
                  `${colors.bgSurface} ${colors.textTertiary}`
                ).split(" ")[1],
              }}
            >
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
            <span className="font-medium text-sigap-textMuted">Sebelum:</span>
            <JsonView data={entry.before_data} />
          </div>
          <div>
            <span className="font-medium text-sigap-textMuted">Sesudah:</span>
            <JsonView data={entry.after_data} />
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
  onChecklist,
  isLast,
}: {
  category: TreeCategory;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onViewAudit: (cat: Category) => void;
  onChecklist: (cat: Category) => void;
  isLast: boolean;
}) => {
  const indent = category.level * 24;

  return (
    <tr
      className={`border-b hover:bg-[var(--card-bg)] ${isLast ? "border-b-0" : ""}`}
      style={{ borderColor: colors.borderCard }}
    >
      <td className="px-4 py-3">
        <div
          className="flex items-center gap-2"
          style={{ paddingLeft: `${indent}px` }}
        >
          {category.level > 0 && (
            <span
              className="absolute left-0 w-px h-4"
              style={{
                left: `${indent - 12}px`,
                backgroundColor: colors.borderCard,
              }}
            />
          )}
          {category.icon ? (
            <span className="text-lg">{category.icon}</span>
          ) : (
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-xs"
              style={{
                backgroundColor: extendedColors.bgSoft,
                color: colors.textMuted,
              }}
            >
              -
            </span>
          )}
          <div className="min-w-0">
            <p
              className="font-medium text-sm truncate"
              style={{ color: colors.textPrimary }}
            >
              {category.name}
            </p>
            <p
              className="text-xs font-mono truncate"
              style={{ color: colors.textMuted }}
            >
              {category.slug}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm max-w-[200px]">
        {category.description ? (
          <p
            className="truncate"
            title={category.description}
            style={{ color: colors.textMuted }}
          >
            {category.description}
          </p>
        ) : (
          <span style={{ color: colors.textMuted }}>-</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {category.parent_id ? (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: extendedColors.primaryLightVariant,
              color: colors.primaryDark,
            }}
          >
            Sub-kategori
          </span>
        ) : (
          <span className="text-xs" style={{ color: colors.textMuted }}>
            Kategori Utama
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            className="text-xs hover:underline"
            onClick={() => onChecklist(category)}
          >
            Daftar pemeriksaan
          </button>
          <button
            onClick={() => onViewAudit(category)}
            className="text-xs hover:underline"
            title="Lihat Riwayat"
            style={{ color: colors.textMuted }}
          >
            Audit
          </button>
          <button
            onClick={() => onEdit(category)}
            className="text-xs font-medium hover:underline"
            style={{ color: colors.primary }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(category)}
            className="text-xs font-medium hover:underline"
            style={{ color: colors.danger }}
          >
            Hapus
          </button>
        </div>
      </td>
    </tr>
  );
};

export const Categories = () => {
  const [checklistCategory, setChecklistCategory] = useState<Category | null>(
    null,
  );
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

  const loadCategories = useCallback(() => {
    setLoading(true);
    api
      .categories()
      .then((data) => setCategories(Array.isArray(data.data) ? data.data : []))
      .catch((e) => {
        logger.error("Failed to fetch categories", { error: e });
        setError("Gagal memuat kategori");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadAuditEntries = useCallback((categoryId: string) => {
    setAuditLoading(true);
    api
      .auditSearch({ limit: 20 } as Parameters<typeof api.auditSearch>[0])
      .then((data) =>
        setAuditEntries(
          data.data.filter(
            (e) => e.object_type === "category" && e.object_id === categoryId,
          ),
        ),
      )
      .catch((e) => {
        logger.error("Failed to fetch audit entries", { error: e });
        setAuditEntries([]);
      })
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
      errors.parent_id =
        "Kategori tidak dapat menjadi parent dari dirinya sendiri";
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
      ...(formData.description.trim() && {
        description: formData.description.trim(),
      }),
      ...(formData.parent_id && { parent_id: formData.parent_id }),
      ...(!formData.parent_id && { parent_id: null }),
    };

    try {
      if (editingCategory) {
        const previous = categories;
        setCategories((prev) =>
          prev.map((c) =>
            c.id === editingCategory.id ? { ...c, ...body } : c,
          ),
        );
        try {
          const updated = await api.updateCategory(editingCategory.id, body);
          setCategories((prev) =>
            prev.map((c) => (c.id === editingCategory.id ? updated : c)),
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
          setCategories((prev) =>
            prev.map((c) => (c.id === tempId ? created : c)),
          );
        } catch (err) {
          setCategories((prev) => prev.filter((c) => c.id !== tempId));
          throw err;
        }
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
    const previous = categories;
    setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    try {
      await api.deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: unknown) {
      logger.error("Failed to delete category", { error: err });
      setCategories(previous);
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

  const tree = buildTree(categories);
  const flatCategories = flattenTree(tree);

  const parentOptions = categories.filter((c) => c.id !== editingCategory?.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            Kategori Laporan
          </h2>
          <p className="text-xs text-sigap-textTertiary mt-0.5">
            {categories?.length ?? 0} kategori tersedia. Pilih kategori untuk
            mengatur nama, penjelasan, dan langkah pemeriksaan yang akan
            digunakan petugas.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity shadow-sm"
          style={{ backgroundColor: colors.primary }}
        >
          <span>+</span> Tambah Kategori
        </button>
      </div>

      {error && (
        <div
          className="mb-4 p-4 rounded border text-sm flex items-center justify-between"
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
            className="font-bold ml-4 min-h-11 focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-4">
          <Skeleton.List itemCount={4} itemHeight={72} />
        </div>
      ) : (categories?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CategoriesIcon size={48} />}
          title="Tidak ada kategori."
          subtitle="Tambahkan kategori pertama untuk memulai."
        />
      ) : (
        <SigapCard padding={0} className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{
                  backgroundColor: extendedColors.bgScreen,
                  borderColor: colors.borderCard,
                }}
              >
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: colors.textMuted }}
                >
                  Nama / kode kategori
                </th>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: colors.textMuted }}
                >
                  Deskripsi
                </th>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: colors.textMuted }}
                >
                  Tipe
                </th>
                <th
                  className="text-left px-4 py-3 font-medium"
                  style={{ color: colors.textMuted }}
                >
                  Aksi
                </th>
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
                  onChecklist={setChecklistCategory}
                  isLast={idx === (flatCategories?.length ?? 0) - 1}
                />
              ))}
            </tbody>
          </table>
        </SigapCard>
      )}

      {checklistCategory && (
        <CategoryChecklistEditor
          category={checklistCategory}
          onClose={() => setChecklistCategory(null)}
        />
      )}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
            style={{ border: `1px solid ${colors.borderCard}` }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
              style={{
                borderColor: colors.borderCard,
                backgroundColor: colors.bgCard,
              }}
            >
              <h3
                className="font-semibold"
                style={{ color: colors.textPrimary }}
              >
                {editingCategory ? "Edit Kategori" : "Tambah Kategori"}
              </h3>
              <button
                onClick={closeModal}
                className="transition-colors text-lg font-bold"
                style={{ color: colors.textMuted }}
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
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
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
                      setFormData((prev) => ({
                        ...prev,
                        slug: e.target.value.toLowerCase(),
                      }))
                    }
                    placeholder="contoh: jalan-rusak"
                    className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sigap-primary/40 pr-16"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        slug: slugify(prev.name),
                      }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-sigap-primary hover:underline"
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
                    setFormData((prev) => ({
                      ...prev,
                      parent_id: e.target.value || null,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                >
                  <option value="">Tidak ada (Kategori Utama)</option>
                  {parentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                {formErrors.parent_id && (
                  <p className="text-xs" style={{ color: colors.danger }}>
                    {formErrors.parent_id}
                  </p>
                )}
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
                      setFormData((prev) => ({ ...prev, icon: e.target.value }))
                    }
                    placeholder="Contoh: 🚧 atau nama icon"
                    className="flex-1 px-3 py-2 rounded-lg border border-sigap-border bg-sigap-background text-sm focus:outline-none focus:ring-2 focus:ring-sigap-primary/40"
                  />
                  <div className="flex items-center justify-center w-10 h-10 rounded border border-sigap-border bg-sigap-background text-lg">
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
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
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

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4"
            style={{ border: `1px solid ${colors.borderCard}` }}
          >
            <div className="p-6">
              <h3
                className="font-semibold text-lg mb-2"
                style={{ color: colors.textPrimary }}
              >
                Hapus Kategori?
              </h3>
              <p className="text-sm mb-6" style={{ color: colors.textMuted }}>
                Apakah Anda yakin ingin menghapus kategori{" "}
                <strong style={{ color: colors.textPrimary }}>
                  {deleteTarget.name}
                </strong>
                ? Aplikasi akan menghapus kategori dari pilihan untuk laporan
                baru. Periksa kembali pilihan ini sebelum melanjutkan.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: colors.borderCard,
                    color: colors.textMuted,
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: colors.danger }}
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
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
            style={{ border: `1px solid ${colors.borderCard}` }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: colors.borderCard }}
            >
              <div>
                <h3
                  className="font-semibold"
                  style={{ color: colors.textPrimary }}
                >
                  Riwayat Audit
                </h3>
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  {auditTarget?.name}
                </p>
              </div>
              <button
                onClick={closeAuditPanel}
                className="transition-colors text-lg font-bold"
                style={{ color: colors.textMuted }}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {auditLoading ? (
                <p
                  className="py-8 text-center"
                  style={{ color: colors.textMuted }}
                >
                  Memuat...
                </p>
              ) : (auditEntries?.length ?? 0) === 0 ? (
                <p
                  className="text-center py-8"
                  style={{ color: colors.textMuted }}
                >
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
