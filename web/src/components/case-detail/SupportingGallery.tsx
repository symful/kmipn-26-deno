import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { logger } from "@/lib/logger";

interface SupportingGalleryProps {
  reportId: string;
}

interface SupportingReport {
  id: string;
  photo_urls: string[];
  created_at: string;
  status: string;
}

export const SupportingGalleryLoadingState = () => (
  <div className="animate-pulse bg-neutral-100 rounded-lg h-32"></div>
);

export const SupportingGalleryEmptyState = () => (
  <div className="bg-neutral-50 rounded-lg p-4 text-center">
    <p className="text-sm text-neutral-400">Tidak ada foto pendukung</p>
  </div>
);

export const SupportingGalleryErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <div className="bg-danger-100 rounded-lg p-4 text-center">
    <p className="text-sm text-danger-600">Gagal memuat foto</p>
    <button onClick={onRetry} className="mt-2 text-xs text-primary-600 hover:underline">
      Coba lagi
    </button>
  </div>
);

export const SupportingGallery = ({ reportId }: SupportingGalleryProps) => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSupporting = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.reportSupporting(reportId);
      const reports = res.reports as SupportingReport[];
      setPhotos(reports.flatMap((r) => r.photo_urls));
      setTotalCount(reports.length);
    } catch (e) {
      logger.error("Failed to load supporting reports", { error: e });
      setError("Gagal memuat laporan pendukung");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      fetchSupporting();
    }
  }, [reportId]);

  if (loading) return <SupportingGalleryLoadingState />;
  if (error) return <SupportingGalleryErrorState onRetry={fetchSupporting} />;
  if (photos.length === 0) return <SupportingGalleryEmptyState />;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
        Foto Pendukung ({totalCount})
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {photos.slice(0, 9).map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Foto pendukung ${i + 1}`}
            className="w-full h-20 object-cover rounded-lg border border-neutral-200"
          />
        ))}
      </div>
      {totalCount > 9 && (
        <p className="text-xs text-neutral-400 mt-2 text-center">
          +{totalCount - 9} foto lainnya
        </p>
      )}
    </div>
  );
};
