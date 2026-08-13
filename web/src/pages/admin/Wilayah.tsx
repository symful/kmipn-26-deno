import { useEffect, useState, useMemo } from "react";
import { api } from "../../api/client";
import type { WilayahNode } from "../../types";
import { useAuthStore } from "../../stores/auth";
import { colors } from "../../theme/tokens";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

type WilayahLevel = "PROVINSI" | "KABUPATEN" | "KECAMATAN" | "DESA";

const LEVEL_OPTIONS: { value: WilayahLevel; label: string }[] = [
  { value: "PROVINSI", label: "Provinsi" },
  { value: "KABUPATEN", label: "Kabupaten/Kota" },
  { value: "KECAMATAN", label: "Kecamatan" },
  { value: "DESA", label: "Desa/Kelurahan" },
];

const LEVEL_ORDER: Record<WilayahLevel, number> = {
  PROVINSI: 1,
  KABUPATEN: 2,
  KECAMATAN: 3,
  DESA: 4,
};

interface FormData {
  name: string;
  code: string;
  level: WilayahLevel;
  parent_id: string | null;
}

interface FormErrors {
  name?: string;
  code?: string;
  level?: string;
  parent_id?: string;
}

const validateForm = (data: FormData, flatList: WilayahNode[]): FormErrors => {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = "Nama wilayah wajib diisi";
  else if (data.name.trim().length < 2) errors.name = "Nama minimal 2 karakter";
  if (!data.code.trim()) errors.code = "Kode wilayah wajib diisi";
  else if (!/^[A-Z0-9_-]+$/i.test(data.code.trim())) errors.code = "Kode hanya boleh huruf, angka, underscore, dan dash";
  if (!data.level) errors.level = "Level wajib dipilih";
  if (data.parent_id) {
    const parent = flatList.find((w) => w.id === data.parent_id);
    if (!parent) errors.parent_id = "Parent tidak valid";
    else {
      const parentLevelOrder = LEVEL_ORDER[parent.level as WilayahLevel] ?? 0;
      const childLevelOrder = LEVEL_ORDER[data.level] ?? 0;
      if (childLevelOrder !== parentLevelOrder + 1) {
        errors.parent_id = `Parent harus level ${LEVEL_OPTIONS.find((l) => LEVEL_ORDER[l.value] === parentLevelOrder + 1)?.label ?? ""}`;
      }
    }
  } else if (data.level !== "PROVINSI") {
    errors.parent_id = "Parent wajib dipilih untuk level di bawah Provinsi";
  }
  return errors;
};

interface TreeNodeProps {
  node: WilayahNode;
  level: number;
  selectedId: string | null;
  onSelect: (node: WilayahNode) => void;
  onEdit: (node: WilayahNode) => void;
  onDelete: (node: WilayahNode) => void;
  canEdit: boolean;
}

const TreeNode = ({ node, level, selectedId, onSelect, onEdit, onDelete, canEdit }: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded cursor-pointer group transition-colors ${
          isSelected ? "bg-sigap-primary/10 border border-sigap-primary/30" : "hover:bg-sigap-background border border-transparent"
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => { onSelect(node); if (hasChildren) setExpanded(!expanded); }}
      >
        {hasChildren ? (
          <span className="text-sigap-textMuted text-xs w-3">{expanded ? "▼" : "▶"}</span>
        ) : (
          <span className="text-sigap-textMuted text-xs w-3" />
        )}
        <span className={`font-medium text-sm ${isSelected ? "text-sigap-primary" : ""}`}>{node.name}</span>
        <span className="text-xs text-sigap-textMuted">({node.level})</span>
        <span className="text-xs text-sigap-textMuted font-mono">{node.code}</span>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(node); }}
              className="text-xs text-sigap-primary hover:underline"
            >
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node); }}
              className="text-xs text-red-500 hover:underline"
            >
              Hapus
            </button>
          </div>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function buildTree(flat: WilayahNode[]): WilayahNode[] {
  const map = new Map<string, WilayahNode>();
  const roots: WilayahNode[] = [];

  flat.forEach((node) => {
    map.set(node.id, { ...node, children: [] });
  });

  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: WilayahNode[]): WilayahNode[] => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => { if (n.children?.length) sortNodes(n.children); });
    return nodes;
  };

  return sortNodes(roots);
}

function filterTreeByScope(tree: WilayahNode[], scopeId: string | null): WilayahNode[] {
  if (!scopeId) return tree;

  const findNode = (nodes: WilayahNode[]): WilayahNode | null => {
    for (const n of nodes) {
      if (n.id === scopeId) return n;
      if (n.children) {
        const found = findNode(n.children);
        if (found) return found;
      }
    }
    return null;
  };

  const scopeNode = findNode(tree);
  if (!scopeNode) return tree;
  return [{ ...scopeNode }];
}

interface AuditPanelProps {
  wilayahId: string;
  wilayahName: string;
  onClose: () => void;
}

interface WilayahAuditEntry {
  id: string;
  actor: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

const AuditPanel = ({ wilayahId, wilayahName, onClose }: AuditPanelProps) => {
  const [entries, setEntries] = useState<WilayahAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .wilayahAudit(wilayahId)
      .then((data) => setEntries(data.entries))
      .catch((e) => { logger.error("Failed to fetch wilayah audit trail", { error: e }); setError("Gagal memuat audit trail"); })
      .finally(() => setLoading(false));
  }, [wilayahId]);

  return (
    <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Riwayat Perubahan</h3>
          <p className="text-xs text-sigap-textMuted">{wilayahName}</p>
        </div>
        <button
          onClick={onClose}
          className="text-sigap-textMuted hover:text-sigap-textSecondary"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <p className="text-sigap-textMuted text-sm py-4 text-center">Memuat...</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-sigap-textMuted text-sm py-4 text-center">Tidak ada riwayat perubahan.</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.id} className="border-b border-sigap-border pb-3 last:border-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-sigap-primary">{entry.action.replace("wilayah_", "").toUpperCase()}</span>
                <span className="text-xs text-sigap-textMuted">
                  {new Date(entry.created_at).toLocaleString("id-ID")}
                </span>
              </div>
              <p className="text-xs text-sigap-textMuted">Actor: {entry.actor ?? "-"}</p>
              {entry.before !== null && entry.after !== null && typeof entry.before === "object" && typeof entry.after === "object" && (
                <div className="mt-1 text-xs">
                  <span className="text-sigap-textMuted">Sebelum: </span>
                  <span className="font-mono">{String((entry.before as { name?: string; code?: string }).name ?? "-")}</span>
                  <span className="text-sigap-textMuted ml-2">→ Sesudah: </span>
                  <span className="font-mono">{String((entry.after as { name?: string; code?: string }).name ?? "-")}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface DeleteConfirmModalProps {
  node: WilayahNode;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const DeleteConfirmModal = ({ node, onConfirm, onCancel, isDeleting }: DeleteConfirmModalProps) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-sm mx-4">
      <h3 className="text-lg font-semibold mb-2">Hapus Wilayah</h3>
      <p className="text-sm text-sigap-textSecondary mb-4">
        Apakah Anda yakin ingin menghapus <strong>{node.name}</strong> ({node.code})?
        {node.children && node.children.length > 0 && (
          <span className="block mt-2 text-red-500">Wilayah ini memiliki {node.children.length} anak. Menghapus parent akan memengaruhi seluruh hierarki.</span>
        )}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded hover:bg-red-600 disabled:opacity-50"
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

export const AdminWilayah = () => {
  const [flatWilayah, setFlatWilayah] = useState<WilayahNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingNode, setEditingNode] = useState<WilayahNode | null>(null);
  const [deleteNode, setDeleteNode] = useState<WilayahNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedNode, setSelectedNode] = useState<WilayahNode | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: "", code: "", level: "PROVINSI", parent_id: null });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  const isAdmin = user?.role === "ADMIN";
  const isAdminDaerah = user?.role === "ADMIN_DAERAH";
  const userWilayahId = user?.wilayah_id ?? null;

  const tree = useMemo(() => buildTree(flatWilayah), [flatWilayah]);
  const scopedTree = useMemo(() => filterTreeByScope(tree, isAdminDaerah ? userWilayahId : null), [tree, isAdminDaerah, userWilayahId]);

  const fetchWilayah = () => {
    setLoading(true);
    api
      .wilayah()
      .then((data) => setFlatWilayah(data.wilayah))
      .catch((e) => { logger.error("Failed to fetch wilayah", { error: e }); setError("Gagal memuat wilayah"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWilayah();
  }, []);

  const validParents = useMemo(() => {
    if (!formData.level) return [];
    const levelOrder = LEVEL_ORDER[formData.level];
    if (levelOrder <= 1) return [];
    return flatWilayah.filter((w) => LEVEL_ORDER[w.level as WilayahLevel] === levelOrder - 1);
  }, [flatWilayah, formData.level]);

  const openCreateForm = (parentNode?: WilayahNode) => {
    setEditingNode(null);
    setSelectedNode(null);
    if (parentNode) {
      const parentLevel = LEVEL_ORDER[parentNode.level as WilayahLevel];
      const childLevel = LEVEL_OPTIONS.find((l) => LEVEL_ORDER[l.value] === parentLevel + 1);
      setFormData({
        name: "",
        code: "",
        level: childLevel?.value ?? "DESA",
        parent_id: parentNode.id,
      });
    } else {
      setFormData({ name: "", code: "", level: "PROVINSI", parent_id: null });
    }
    setFormErrors({});
    setSubmitError(null);
    setShowForm(true);
  };

  const openEditForm = (node: WilayahNode) => {
    setEditingNode(node);
    setSelectedNode(null);
    setFormData({
      name: node.name,
      code: node.code,
      level: node.level as WilayahLevel,
      parent_id: node.parent_id,
    });
    setFormErrors({});
    setSubmitError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingNode(null);
    setFormData({ name: "", code: "", level: "PROVINSI", parent_id: null });
    setFormErrors({});
    setSubmitError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === "level") {
      const newLevel = value as WilayahLevel;
      setFormData((prev) => ({
        ...prev,
        level: newLevel,
        parent_id: newLevel === "PROVINSI" ? null : prev.parent_id,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: name === "parent_id" ? (value === "" ? null : value) : value }));
    }
    setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(formData, flatWilayah);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (editingNode) {
        await api.updateWilayah(editingNode.id, formData);
      } else {
        await api.createWilayah(formData);
      }
      fetchWilayah();
      closeForm();
    } catch (err) {
      logger.error("Failed to save wilayah", { error: err });
      setSubmitError(err instanceof Error ? err.message : "Gagal menyimpan wilayah");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteNode) return;
    setIsDeleting(true);
    try {
      await api.deleteWilayah(deleteNode.id);
      setDeleteNode(null);
      setSelectedNode(null);
      fetchWilayah();
    } catch (err) {
      logger.error("Failed to delete wilayah", { error: err });
      alert(err instanceof Error ? err.message : "Gagal menghapus wilayah");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNodeSelect = (node: WilayahNode) => {
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
    setShowForm(false);
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
                {isAdminDaerah && userWilayahId && (
                  <span className="ml-1 text-sigap-primary">• Lingkup: {userWilayahId.slice(0, 8)}...</span>
                )}
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
          <div>
            <h2 className="text-lg font-semibold">Wilayah</h2>
            {isAdminDaerah && (
              <p className="text-xs text-sigap-textMuted">Menampilkan wilayah dalam lingkup Anda</p>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => openCreateForm()}
              className="px-4 py-2 bg-sigap-primary text-white text-sm font-medium rounded hover:opacity-90"
            >
              + Tambah Wilayah
            </button>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-sigap-surface rounded-lg border border-sigap-border p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">
                {editingNode ? "Edit Wilayah" : "Tambah Wilayah"}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nama Wilayah</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded text-sm bg-sigap-background ${
                      formErrors.name ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="Contoh: Jakarta Selatan"
                  />
                  {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Kode Wilayah</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border rounded text-sm bg-sigap-background ${
                      formErrors.code ? "border-red-500" : "border-sigap-border"
                    }`}
                    placeholder="Contoh: JK-SEL"
                  />
                  {formErrors.code && <p className="text-xs text-red-500 mt-1">{formErrors.code}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Level</label>
                  <select
                    name="level"
                    value={formData.level}
                    onChange={handleInputChange}
                    disabled={!!editingNode}
                    className={`w-full px-3 py-2 border rounded text-sm bg-sigap-background ${
                      formErrors.level ? "border-red-500" : "border-sigap-border"
                    } ${editingNode ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {formErrors.level && <p className="text-xs text-red-500 mt-1">{formErrors.level}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Parent {formData.level === "PROVINSI" && "(opsional)"}
                  </label>
                  <select
                    name="parent_id"
                    value={formData.parent_id ?? ""}
                    onChange={handleInputChange}
                    disabled={formData.level === "PROVINSI"}
                    className={`w-full px-3 py-2 border rounded text-sm bg-sigap-background ${
                      formErrors.parent_id ? "border-red-500" : "border-sigap-border"
                    } ${formData.level === "PROVINSI" ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <option value="">-- Pilih Parent --</option>
                    {validParents.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                  {formErrors.parent_id && <p className="text-xs text-red-500 mt-1">{formErrors.parent_id}</p>}
                </div>
                {submitError && (
                  <p className="text-sm text-red-500">{submitError}</p>
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
                    onClick={closeForm}
                    disabled={isSubmitting}
                    className="px-4 py-2 border border-sigap-border text-sm font-medium rounded hover:bg-sigap-background disabled:opacity-50"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteNode && (
          <DeleteConfirmModal
            node={deleteNode}
            onConfirm={handleDelete}
            onCancel={() => setDeleteNode(null)}
            isDeleting={isDeleting}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {loading ? (
              <p className="text-sigap-textMuted py-8 text-center">Memuat...</p>
            ) : error ? (
              <div className="p-4 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            ) : scopedTree.length === 0 ? (
              <p className="text-center text-sigap-textMuted py-8">
                Tidak ada data wilayah.
              </p>
            ) : (
              <div className="bg-sigap-surface rounded-lg border border-sigap-border">
                {scopedTree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    level={0}
                    selectedId={selectedNode?.id ?? null}
                    onSelect={handleNodeSelect}
                    onEdit={openEditForm}
                    onDelete={setDeleteNode}
                    canEdit={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {selectedNode && (
              <AuditPanel
                wilayahId={selectedNode.id}
                wilayahName={selectedNode.name}
                onClose={() => setSelectedNode(null)}
              />
            )}

            {selectedNode && isAdmin && (
              <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
                <h3 className="text-base font-semibold mb-3">Aksi</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => openEditForm(selectedNode)}
                    className="w-full px-4 py-2 bg-sigap-primary text-white text-sm font-medium rounded hover:opacity-90"
                  >
                    Edit Wilayah
                  </button>
                  <button
                    onClick={() => openCreateForm(selectedNode)}
                    disabled={selectedNode.level === "DESA"}
                    className="w-full px-4 py-2 border border-sigap-border text-sm font-medium rounded hover:bg-sigap-background disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Tambah Child
                  </button>
                  <button
                    onClick={() => setDeleteNode(selectedNode)}
                    className="w-full px-4 py-2 border border-red-200 text-red-500 text-sm font-medium rounded hover:bg-red-50"
                  >
                    Hapus Wilayah
                  </button>
                </div>
              </div>
            )}

            {!selectedNode && (
              <div className="bg-sigap-surface rounded-lg border border-sigap-border p-4">
                <p className="text-sm text-sigap-textMuted text-center">
                  Pilih wilayah untuk melihat riwayat perubahan dan aksi
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
