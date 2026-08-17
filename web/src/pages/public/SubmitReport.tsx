import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { colors } from "../../theme/tokens";
import exifr from "exifr";

const API_BASE = "https://kmipn-26-deno.careday17.workers.dev";

interface Category {
  id: string;
  name: string;
}

interface PhotoFile {
  file: File;
  preview: string;
  exifGps?: { lat: number; lng: number };
  exifTimestamp?: string;
}

interface GpsState {
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

interface FormData {
  category_id: string;
  description: string;
  lat: string;
  lng: string;
}

export const SubmitReport = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormData>({
    category_id: "",
    description: "",
    lat: "",
    lng: "",
  });
  const [gps, setGps] = useState<GpsState>({ loading: false, error: null, permissionDenied: false });

  useEffect(() => {
    fetch(`${API_BASE}/api/categories`, {
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCategories(data);
        } else {
          setCategories(data?.categories ?? []);
        }
      })
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      captureGps();
    } else {
      setGps({ loading: false, error: "Geolocation tidak didukung perangkat ini", permissionDenied: false });
    }
  }, []);

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGps({ loading: false, error: "Geolocation tidak didukung perangkat ini", permissionDenied: false });
      return;
    }

    setGps({ loading: true, error: null, permissionDenied: false });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setForm((prev) => ({
          ...prev,
          lat: String(latitude),
          lng: String(longitude),
        }));
        setGps({ loading: false, error: null, permissionDenied: false });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGps({ loading: false, error: null, permissionDenied: true });
        } else {
          setGps({ loading: false, error: `GPS error: ${err.message}`, permissionDenied: false });
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const extractExifData = async (file: File): Promise<{ gps?: { lat: number; lng: number }; timestamp?: string }> => {
    try {
      const exif = await exifr.parse(file, { gps: true, pick: ["GPSLatitude", "GPSLongitude", "DateTimeOriginal"] });
      if (!exif) return {};

      const result: { gps?: { lat: number; lng: number }; timestamp?: string } = {};
      if (exif.latitude != null && exif.longitude != null) {
        result.gps = { lat: exif.latitude, lng: exif.longitude };
      }
      if (exif.DateTimeOriginal) {
        result.timestamp = new Date(exif.DateTimeOriginal).toISOString();
      }
      return result;
    } catch {
      return {};
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: PhotoFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file && file.type.startsWith("image/")) {
        const exifData = await extractExifData(file);
        const photoEntry: PhotoFile = {
          file,
          preview: URL.createObjectURL(file),
        };
        if (exifData.gps) {
          photoEntry.exifGps = exifData.gps;
        }
        if (exifData.timestamp) {
          photoEntry.exifTimestamp = exifData.timestamp;
        }
        newPhotos.push(photoEntry);
      }
    }
    setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const updated = [...prev];
      const photo = updated[index];
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const idempotencyKey = crypto.randomUUID();
    let deviceId = sessionStorage.getItem("sigap_device_id");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      sessionStorage.setItem("sigap_device_id", deviceId);
    }

    try {
      const payload = {
        category_id: form.category_id,
        description: form.description,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        idempotency_key: idempotencyKey,
        device_id: deviceId,
      };

      const response = await fetch(`${API_BASE}/api/public/anonymous-reports`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Request failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.duplicate) {
        setError("Laporan sudah ada. Anda sudah pernah membuat laporan serupa.");
        setSubmitting(false);
        return;
      }

      setSuccess(`Laporan berhasil dikirim. ID laporan: ${result.id}`);
      setForm({ category_id: "", description: "", lat: "", lng: "" });
      setPhotos([]);

      if (navigator.geolocation) {
        captureGps();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim laporan. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lapor Pak!</h1>
              <p className="text-xs text-sigap-textMuted">Pelaporan Infrastruktur Desa</p>
            </div>
          </div>
          <Link to="/" className="text-sm font-medium text-sigap-primary hover:underline">
            Kembali
          </Link>
        </div>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-lg border border-sigap-border p-6">
          <h2 className="text-lg font-bold mb-1">Buat Laporan Baru</h2>
          <p className="text-sm text-sigap-textMuted mb-6">
            Laporkan masalah infrastruktur di desa Anda
          </p>

          {success && (
            <div
              className="mb-4 p-4 rounded-lg text-sm"
              style={{ backgroundColor: colors.selesai + "20", borderColor: colors.selesai + "40", color: colors.selesai }}
            >
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-danger-100 rounded-lg text-danger-600 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sigap-textMuted">Memuat...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Kategori <span className="text-danger-500">*</span>
                </label>
                <select
                  required
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary"
                >
                  <option value="">Pilih kategori</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Deskripsi <span className="text-danger-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Jelaskan masalah yang Anda laporkan..."
                  className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Foto (opsional)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-sigap-border rounded-lg text-sigap-textMuted hover:border-sigap-primary hover:text-sigap-primary transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {photos.length > 0 ? `Tambah foto (${photos.length}/5)` : "Pilih foto"}
                </button>
                {photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-sigap-border">
                        <img src={photo.preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                        {photo.exifGps && (
                          <div className="absolute bottom-1 left-1 text-white text-xs px-1 rounded" style={{ backgroundColor: colors.selesai + "CC" }}>
                            GPS
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute top-1 right-1 w-5 h-5 bg-danger-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-danger-600"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-sigap-textMuted mt-1">Maks 5 foto, format JPG/PNG. GPS dari EXIF akan digunakan jika tersedia.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-sigap-textPrimary mb-1">
                  Lokasi <span className="text-danger-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <input
                      type="number"
                      required
                      step="any"
                      value={form.lat}
                      onChange={(e) => setForm({ ...form, lat: e.target.value })}
                      placeholder="Latitude"
                      className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      required
                      step="any"
                      value={form.lng}
                      onChange={(e) => setForm({ ...form, lng: e.target.value })}
                      placeholder="Longitude"
                      className="w-full px-3 py-2 border border-sigap-border rounded-lg bg-white text-sigap-textPrimary focus:outline-none focus:ring-2 focus:ring-sigap-primary"
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={captureGps}
                    disabled={gps.loading}
                    className="px-3 py-1.5 text-xs border border-sigap-border rounded-lg hover:bg-sigap-background disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {gps.loading ? (
                      <>
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Mendapatkan GPS...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Gunakan GPS Saat Ini
                      </>
                    )}
                  </button>
                  {gps.error && (
                    <span className="text-xs text-danger-600">{gps.error}</span>
                  )}
                  {gps.permissionDenied && (
                    <span className="text-xs text-warning-600">
                      GPS tidak diizinkan. Silakan aktifkan izin lokasi di pengaturan browser.
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: colors.primary }}
              >
                {submitting ? "Mengirim..." : "Kirim Laporan"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
