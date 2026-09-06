import { useEffect, useState, useRef } from "react";
import { ReportLocationPicker } from "../components/ReportLocationPicker";
import "../public-report-form.css";

import exifr from "exifr";
import { api } from "../api/client";
import { logger } from "@/lib/logger";
import type { Category } from "../types";

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
  address_area: string;
  title: string;
  kelurahan: string;
  category_id: string;
  description: string;
  lat: string;
  lng: string;
  population_affected: string;
  vulnerability_index: string;
}

export const SubmitReport = ({ onClose }: { onClose?: () => void }) => {
  const [villages, setVillages] = useState<string[]>([]);
  useEffect(() => {
    void api
      .publicReports({ limit: 100 })
      .then((r) =>
        setVillages([
          ...new Set(
            r.data
              .map((x) => x.wilayah.desa)
              .filter((x): x is string => Boolean(x)),
          ),
        ]),
      )
      .catch(() => {});
  }, []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormData>({
    title: "",
    kelurahan: "",
    address_area: "",
    category_id: "",
    description: "",
    lat: "",
    lng: "",
    population_affected: "",
    vulnerability_index: "",
  });
  const [gps, setGps] = useState<GpsState>({
    loading: false,
    error: null,
    permissionDenied: false,
  });
  const [exifFailed, setExifFailed] = useState(false);

  useEffect(() => {
    api
      .publicCategories()
      .then((data) => setCategories(data))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      captureGps();
    } else {
      setGps({
        loading: false,
        error: "Geolocation tidak didukung perangkat ini",
        permissionDenied: false,
      });
    }
  }, []);

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGps({
        loading: false,
        error: "Geolocation tidak didukung perangkat ini",
        permissionDenied: false,
      });
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
          setGps({
            loading: false,
            error: `GPS error: ${err.message}`,
            permissionDenied: false,
          });
        }
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const extractExifData = async (
    file: File,
  ): Promise<{ gps?: { lat: number; lng: number }; timestamp?: string }> => {
    try {
      const exif = await exifr.parse(file, {
        gps: true,
        pick: ["GPSLatitude", "GPSLongitude", "DateTimeOriginal"],
      });
      if (!exif) return {};

      const result: { gps?: { lat: number; lng: number }; timestamp?: string } =
        {};
      if (exif.latitude != null && exif.longitude != null) {
        result.gps = { lat: exif.latitude, lng: exif.longitude };
      }
      if (exif.DateTimeOriginal) {
        result.timestamp = new Date(exif.DateTimeOriginal).toISOString();
      }
      return result;
    } catch {
      logger.warn("EXIF metadata tidak terbaca", { fileName: file.name });
      setExifFailed(true);
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
      const photoUrls: string[] = [];
      for (const photo of photos) {
        try {
          const res = await api.uploadReportPhotoAnonymous(
            photo.file,
            idempotencyKey,
          );
          if (res.public_url) photoUrls.push(res.public_url);
        } catch (uploadErr) {
          setError(
            uploadErr instanceof Error
              ? uploadErr.message
              : "Gagal mengunggah salah satu foto. Laporan belum dikirim.",
          );
          setSubmitting(false);
          return;
        }
      }

      const result = (await api.publicAnonymousReport({
        title: form.title.trim(),
        kelurahan: form.kelurahan.trim(),
        category_id: form.category_id,
        ...(form.address_area.trim()
          ? { address_area: form.address_area.trim() }
          : {}),
        description: form.description,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        idempotency_key: idempotencyKey,
        device_id: deviceId,
        photos: photoUrls,
        ...(form.population_affected
          ? { population_affected: parseInt(form.population_affected, 10) }
          : {}),
        ...(form.vulnerability_index
          ? { vulnerability_index: parseFloat(form.vulnerability_index) }
          : {}),
      })) as { id: string; status: string; duplicate?: boolean };

      if (result.duplicate) {
        setError(
          "Laporan sudah ada. Anda sudah pernah membuat laporan serupa.",
        );
        setSubmitting(false);
        return;
      }

      setSuccess(
        `Aplikasi sudah menerima laporan Anda. Admin akan memeriksa bukti sebelum menentukan tindak lanjut. Simpan nomor laporan ini untuk rujukan: ${result.id}`,
      );
      setForm({
        title: "",
        kelurahan: "",
        address_area: "",
        category_id: "",
        description: "",
        lat: "",
        lng: "",
        population_affected: "",
        vulnerability_index: "",
      });
      setPhotos([]);

      if (navigator.geolocation) {
        captureGps();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const status = (error as Error & { status?: number }).status;
      let message = "Gagal mengirim laporan. Silakan coba lagi.";

      if (status === 400) {
        if (error.message.includes("OUTSIDE_SERVICE_AREA")) {
          message =
            "Lokasi yang Anda pilih berada di luar area layanan. Silakan pilih lokasi dalam wilayah yang tersedia.";
        } else if (error.message.includes("description")) {
          message =
            "Deskripsi harus minimal 10 karakter. Silakan jelaskan masalah lebih detail.";
        } else if (error.message.includes("CAPTCHA")) {
          message =
            "Verifikasi keamanan gagal. Silakan refresh halaman dan coba lagi.";
        } else {
          message = `Data yang dikirim tidak valid: ${error.message}. Pastikan semua field terisi dengan benar.`;
        }
      } else if (status === 429) {
        message =
          "Terlalu banyak permintaan. Silakan tunggu beberapa menit sebelum mencoba lagi.";
      } else if (status === 500) {
        message =
          "Server sedang mengalami gangguan. Silakan coba beberapa saat lagi.";
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="public-report-form">
      <div className="report-form-heading">
        <h2>Buat laporan cepat</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Tutup">
            ×
          </button>
        )}
      </div>
      <p>
        Ceritakan kondisi fasilitas dan tunjukkan lokasinya. Admin akan
        memeriksa laporan Anda sebelum menentukan penanganan; foto yang jelas
        membantu admin memahami keluhan.
      </p>
      {success && (
        <div role="status" className="report-success">
          {success}
        </div>
      )}
      {error && (
        <div role="alert" className="report-error">
          {error}
        </div>
      )}
      {loading ? (
        <p>Memuat kategori…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="report-form-columns">
            <label>
              Kategori
              <select
                required
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value })
                }
              >
                <option value="">Pilih kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desa
              <input
                required
                list="published-villages"
                value={form.kelurahan}
                onChange={(e) =>
                  setForm({ ...form, kelurahan: e.target.value })
                }
                placeholder="Nama desa / kelurahan"
              />
              <datalist id="published-villages">
                {villages.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
          </div>
          <label>
            Alamat atau patokan (opsional)
            <input
              maxLength={500}
              value={form.address_area}
              onChange={(e) =>
                setForm({ ...form, address_area: e.target.value })
              }
              placeholder="Contoh: dekat balai desa, sisi utara jalan"
            />
          </label>
          <label>
            Judul masalah
            <input
              required
              minLength={8}
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Contoh: Jalan berlubang dekat balai desa"
            />
          </label>
          <label>
            Deskripsi kondisi
            <textarea
              required
              minLength={15}
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Jelaskan kerusakan dan dampaknya bagi warga"
            />
          </label>
          <label>
            Foto bukti (opsional, maksimal 5 foto)
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handlePhotoChange}
            />
          </label>
          <small>
            Unggah foto kondisi sebenarnya. Saran desa berasal dari laporan
            publik; Anda dapat mengetik nama lainnya.
          </small>
          {photos.length > 0 && (
            <div className="report-photo-previews">
              {photos.map((photo, index) => (
                <div key={photo.preview}>
                  <img src={photo.preview} alt={photo.file.name} />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    aria-label={"Hapus foto " + (index + 1)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {exifFailed && (
            <small>
              Foto tidak menyediakan informasi lokasi yang dapat dibaca. Pilih
              titik laporan pada peta; pilihan ini tidak mengubah informasi asli
              foto.
            </small>
          )}
          <label>
            Pilih lokasi pada peta
            <ReportLocationPicker
              lat={form.lat}
              lng={form.lng}
              onChange={(lat, lng) =>
                setForm((prev) => ({
                  ...prev,
                  lat: String(lat),
                  lng: String(lng),
                }))
              }
            />
          </label>
          <div className="report-form-columns">
            <label>
              Lintang
              <input
                required
                type="number"
                step="any"
                min={-90}
                max={90}
                placeholder="Latitude"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
            </label>
            <label>
              Bujur
              <input
                required
                type="number"
                step="any"
                min={-180}
                max={180}
                placeholder="Longitude"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </label>
          </div>
          <div className="report-form-actions">
            <button
              type="button"
              className="ref-button"
              onClick={captureGps}
              disabled={gps.loading}
            >
              {gps.loading ? "Mencari lokasi…" : "Gunakan lokasi saya"}
            </button>
            {onClose && (
              <button type="button" className="ref-button" onClick={onClose}>
                Batal
              </button>
            )}
            <button
              className="ref-button primary"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Mengirim…" : "Kirim Laporan"}
            </button>
          </div>
          {gps.error && <small role="status">{gps.error}</small>}
        </form>
      )}
    </section>
  );
};
