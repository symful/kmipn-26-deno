import { useEffect, useState } from "react";
import type { Category } from "../types";
import type { CategoryChecklistItem } from "../api/checklist-types";
import { api } from "../api/client";
import { Modal } from "./design-system/Modal";

export function CategoryChecklistEditor({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CategoryChecklistItem[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.categoryChecklist(category.id);
      setItems(result.items);
      setVersion(result.version);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Gagal memuat daftar pemeriksaan",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [category.id]);
  return (
    <Modal open onClose={() => !saving && onClose()} size="wide">
      <section
        className="p-6"
        role="dialog"
        aria-label="Daftar pemeriksaan kategori"
      >
        <h2 className="text-lg font-semibold">
          Daftar pemeriksaan · {category.name}
        </h2>
        <p className="text-sm my-3">
          Tuliskan langkah yang perlu petugas lakukan saat memeriksa fasilitas
          dalam kategori ini. Tandai langkah wajib agar petugas memahami bukti
          yang harus mereka lengkapi.{" "}
          {version == null ? "Belum ada versi tersimpan." : `Versi ${version}.`}
        </p>
        {error && (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => void load()}>
              Coba lagi
            </button>
          </p>
        )}
        {loading ? (
          <p role="status">Memuat daftar pemeriksaan…</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setError("");
              setSaved(false);
              try {
                const result = await api.saveCategoryChecklist(
                  category.id,
                  items.map((item) => ({ ...item, item: item.item.trim() })),
                );
                setItems(result.items);
                setVersion(result.version);
                setSaved(true);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Gagal menyimpan daftar pemeriksaan",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-3">
              {items.map((item, index) => (
                <div className="flex gap-3 items-center" key={index}>
                  <input
                    className="ref-input flex-1"
                    aria-label={`Langkah ${index + 1}`}
                    required
                    maxLength={300}
                    value={item.item}
                    onChange={(e) => {
                      setSaved(false);
                      setItems(
                        items.map((value, i) =>
                          i === index
                            ? { ...value, item: e.target.value }
                            : value,
                        ),
                      );
                    }}
                  />
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) => {
                        setSaved(false);
                        setItems(
                          items.map((value, i) =>
                            i === index
                              ? { ...value, required: e.target.checked }
                              : value,
                          ),
                        );
                      }}
                    />{" "}
                    Wajib
                  </label>
                  <button
                    type="button"
                    className="ref-button"
                    aria-label={`Hapus langkah ${index + 1}`}
                    onClick={() => {
                      setSaved(false);
                      setItems(items.filter((_, i) => i !== index));
                    }}
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="ref-button mt-3"
              disabled={items.length >= 50 || saving}
              onClick={() => {
                setSaved(false);
                setItems([...items, { item: "", required: true }]);
              }}
            >
              Tambah langkah
            </button>
            {saved && (
              <p role="status" className="my-3">
                Daftar pemeriksaan tersimpan.
              </p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                className="ref-button"
                disabled={saving}
                onClick={onClose}
              >
                Tutup
              </button>
              <button
                className="ref-button primary"
                disabled={
                  saving ||
                  items.length === 0 ||
                  items.some((item) => !item.item.trim())
                }
              >
                {saving ? "Menyimpan…" : "Simpan daftar pemeriksaan"}
              </button>
            </div>
          </form>
        )}
      </section>
    </Modal>
  );
}
