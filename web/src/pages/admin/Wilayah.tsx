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

const LEVEL_COLORS: Record<WilayahLevel, { bg: string; text: string; border: string }> = {
  PROVINSI: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  KABUPATEN: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200" },
  KECAMATAN: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  DESA: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
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
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  onSelect: (node: WilayahNode) => void;
  onEdit: (node: WilayahNode) => void;
  onDelete: (node: WilayahNode) => void;
  canEdit: boolean;
}

const TreeNode = ({
  node,
  level,
  selectedId,
  expandedNodes,
  onToggle,
  onSelect,
  onEdit,
  onDelete,
  canEdit,
}: TreeNodeProps) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;
  const levelStyle = LEVEL_COLORS[node.level as WilayahLevel] ?? LEVEL_COLORS.DESA;
  const indentPx = level * 24;

  return (
    <div className="relative">
      {level > 0 && (
        <div
          className="absolute top-0 bottom-0 w-px bg-sigap-border"
          style={{ left: `${indentPx - 12}px` }}
        />
      )}

      <div
        className={`
          relative flex items-center gap-2 py-2.5 px-3 rounded-[8px] cursor-pointer
          transition-all duration-150 group
          ${isSelected
            ? "bg-teal-50 border border-teal-200 shadow-sm"
            : "hover:bg-sigap-surface border border-transparent"
          }
        `}
        style={{ paddingLeft: `${indentPx + 12}px`, marginLeft: level === 0 ? "0" : "12px" }}
        onClick={() => {
          onSelect(node);
          if (hasChildren) onToggle(node.id);
        }}
      >
        {level > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-px bg-sigap-border"
            style={{ left: `${indentPx - 12}px` }}
          />
        )}

        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              className="w-5 h-5 rounded bg-sigap-surface border border-sigap-border flex items-center justify-center text-sigap-textMuted hover:bg-teal-50 hover:border-teal-200 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-2 h-2 rounded-full bg-sigap-border" />
          )}
        </div>

        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${levelStyle.bg} ${levelStyle.text}`}>
          {node.level === "PROVINSI" ? "Prov" : node.level === "KABUPATEN" ? "Kab" : node.level === "KECAMATAN" ? "Kec" : "Desa"}
        </span>

        <div className="flex-1 min-w-0">
          <span className={`font-medium text-sm block truncate ${isSelected ? "text-teal-700" : "text-sigap-textPrimary"}`}>
            {node.name}
          </span>
        </div>

        <span className="text-xs font-mono text-sigap-textMuted shrink-0">
          {node.code}
        </span>

        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(node); }}
              className="px-2 py-1 text-xs font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded transition-colors"
            >
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node); }}
              className="px-2 py-1 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              Hapus
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-1">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
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

interface DeleteConfirmModalProps {
  node: WilayahNode;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

const DeleteConfirmModal = ({ node, onConfirm, onCancel, isDeleting }: DeleteConfirmModalProps) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-sigap-surface rounded-[12px] border border-sigap-border p-6 w-full max-w-sm mx-4 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-sigap-textPrimary">Hapus Wilayah</h3>
          <p className="text-xs text-sigap-textMuted">Aksi ini tidak dapat dibatalkan</p>
        </div>
      </div>
      <p className="text-sm text-sigap-textSecondary mb-4">
        Apakah Anda yakin ingin menghapus <strong className="text-sigap-textPrimary">{node.name}</strong> ({node.code})?
      </p>
      {node.children && node.children.length > 0 && (
        <div className="mb-4 p-3 rounded-[8px] bg-red-50 border border-red-200">
          <p className="text-xs text-red-600">
            <strong>Perhatian:</strong> Wilayah ini memiliki {node.children.length} anak wilayah. Menghapus parent akan menghapus seluruh hierarki di bawahnya.
          </p>
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="flex-1 px-4 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-[8px] hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {isDeleting ? "Menghapus..." : "Ya, Hapus"}
        </button>
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="flex-1 px-4 py-2.5 border border-sigap-border text-sm font-semibold rounded-[8px] hover:bg-sigap-background disabled:opacity-50 transition-colors"
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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (scopedTree.length > 0) {
      const toExpand = new Set<string>();
      const expandLevel = (nodes: WilayahNode[], level: number) => {
        if (level < 2) {
          nodes.forEach((n) => {
            if (n.children && n.children.length > 0) {
              toExpand.add(n.id);
              expandLevel(n.children, level + 1);
            }
          });
        }
      };
      expandLevel(scopedTree, 0);
      setExpandedNodes(toExpand);
    }
  }, [scopedTree]);

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

  const handleToggle = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const countNodes = (nodes: WilayahNode[]): number => {
    return nodes.reduce((acc, n) => acc + 1 + (n.children ? countNodes(n.children) : 0), 0);
  };

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface border-b border-sigap-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: colors.primary }}
              >
                W
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-sigap-textPrimary">Manajemen Wilayah</h1>
                <p className="text-xs text-sigap-textMuted">
                  {user?.name ?? ""} ({user?.role ?? ""})
                  {isAdminDaerah && userWilayahId && (
                    <span className="ml-1 text-teal-600">• Lingkup: {userWilayahId.slice(0, 8)}...</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
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
          <div>
            <h2 className="text-lg font-semibold text-sigap-textPrimary">Hierarki Wilayah</h2>
            <p className="text-xs text-sigap-textMuted mt-0.5">
              {loading ? "Memuat..." : `${countNodes(scopedTree)} wilayah dalam hierarki`}
              {isAdminDaerah && " • Menampilkan wilayah dalam lingkup Anda"}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => openCreateForm()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-[8px] hover:bg-teal-700 transition-colors shadow-sm"
              style={{ boxShadow: "0 4px 12px -2px rgba(15,122,107,0.4)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Tambah Wilayah
            </button>
          )}
        </div>

        <div className="bg-sigap-surface rounded-[12px] border border-sigap-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
                <p className="text-sm text-sigap-textMuted">Memuat hierarki wilayah...</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="p-4 rounded-[8px] bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            </div>
          ) : scopedTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-sigap-background flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-sigap-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-sigap-textMuted text-center">Tidak ada data wilayah.</p>
              {isAdmin && (
                <button
                  onClick={() => openCreateForm()}
                  className="mt-4 text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  Tambah wilayah pertama →
                </button>
              )}
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-sigap-border">
                <span className="text-xs text-sigap-textMuted">Level:</span>
                <div className="flex items-center gap-3">
                  {LEVEL_OPTIONS.map((opt) => (
                    <span
                      key={opt.value}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${LEVEL_COLORS[opt.value].bg} ${LEVEL_COLORS[opt.value].text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${opt.value === "PROVINSI" ? "bg-teal-500" : opt.value === "KABUPATEN" ? "bg-cyan-500" : opt.value === "KECAMATAN" ? "bg-sky-500" : "bg-indigo-500"}`} />
                      {opt.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                {scopedTree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    level={0}
                    selectedId={selectedNode?.id ?? null}
                    expandedNodes={expandedNodes}
                    onToggle={handleToggle}
                    onSelect={handleNodeSelect}
                    onEdit={openEditForm}
                    onDelete={setDeleteNode}
                    canEdit={isAdmin}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedNode && (
          <div className="mt-6 bg-sigap-surface rounded-[12px] border border-sigap-border p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${LEVEL_COLORS[selectedNode.level as WilayahLevel]?.bg ?? "bg-gray-100"} ${LEVEL_COLORS[selectedNode.level as WilayahLevel]?.text ?? "text-gray-700"}`}>
                    {selectedNode.level}
                  </span>
                  <h3 className="font-semibold text-sigap-textPrimary">{selectedNode.name}</h3>
                </div>
                <p className="text-sm text-sigap-textMuted font-mono">Kode: {selectedNode.code}</p>
                {selectedNode.parent_id && (
                  <p className="text-xs text-sigap-textMuted mt-1">
                    Parent: {flatWilayah.find((w) => w.id === selectedNode.parent_id)?.name ?? "Unknown"}
                  </p>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(selectedNode)}
                    className="px-3 py-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-[6px] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openCreateForm(selectedNode)}
                    disabled={selectedNode.level === "DESA"}
                    className="px-3 py-1.5 text-xs font-medium text-sigap-primary hover:bg-teal-50 rounded-[6px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + Tambah Child
                  </button>
                  <button
                    onClick={() => setDeleteNode(selectedNode)}
                    className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sigap-surface rounded-[12px] border border-sigap-border p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-sigap-textPrimary">
                  {editingNode ? "Edit Wilayah" : "Tambah Wilayah"}
                </h3>
                <p className="text-xs text-sigap-textMuted mt-0.5">
                  {editingNode ? `Mengedit ${editingNode.name}` : "Tambah wilayah baru ke hierarki"}
                </p>
              </div>
              <button
                onClick={closeForm}
                className="w-8 h-8 rounded-[6px] hover:bg-sigap-background flex items-center justify-center text-sigap-textMuted hover:text-sigap-textSecondary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1.5">Nama Wilayah</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2.5 border rounded-[8px] text-sm bg-sigap-background focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors ${
                    formErrors.name ? "border-red-400" : "border-sigap-border"
                  }`}
                  placeholder="Contoh: Jakarta Selatan"
                />
                {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1.5">Kode Wilayah</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2.5 border rounded-[8px] text-sm bg-sigap-background font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors ${
                    formErrors.code ? "border-red-400" : "border-sigap-border"
                  }`}
                  placeholder="Contoh: JK-SEL"
                />
                {formErrors.code && <p className="text-xs text-red-500 mt-1">{formErrors.code}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1.5">Level</label>
                <select
                  name="level"
                  value={formData.level}
                  onChange={handleInputChange}
                  disabled={!!editingNode}
                  className={`w-full px-3 py-2.5 border rounded-[8px] text-sm bg-sigap-background focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors ${
                    formErrors.level ? "border-red-400" : "border-sigap-border"
                  } ${editingNode ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {formErrors.level && <p className="text-xs text-red-500 mt-1">{formErrors.level}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1.5">
                  Parent {formData.level === "PROVINSI" && "(opsional)"}
                </label>
                <select
                  name="parent_id"
                  value={formData.parent_id ?? ""}
                  onChange={handleInputChange}
                  disabled={formData.level === "PROVINSI"}
                  className={`w-full px-3 py-2.5 border rounded-[8px] text-sm bg-sigap-background focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors ${
                    formErrors.parent_id ? "border-red-400" : "border-sigap-border"
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
                <div className="p-3 rounded-[8px] bg-red-50 border border-red-200 text-xs text-red-600">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-[8px] hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 border border-sigap-border text-sm font-semibold rounded-[8px] hover:bg-sigap-background disabled:opacity-50 transition-colors"
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
    </div>
  );
};
