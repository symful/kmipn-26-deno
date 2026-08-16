import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { statusColor, statusLabel } from "../../theme/tokens";
import { logger } from "@/lib/logger";

interface PublicCaseData {
  id: string;
  status: string;
  generalized_location: string | null;
  created_at: string;
}

export const PublicCaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<PublicCaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("ID kasus tidak valid");
      return;
    }

    api.publicReport(id)
      .then((data) => {
        setCaseData({
          id: data.id,
          status: data.status,
          generalized_location: data.generalized_location,
          created_at: data.created_at,
        });
      })
      .catch((e) => {
        logger.error("Failed to fetch case detail", { error: e });
        setError("Laporan tidak ditemukan");
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen bg-sigap-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg p-6 border border-sigap-border">
          <h1 className="text-xl font-bold mb-4">Detail Laporan</h1>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sigap-textMuted">Memuat...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          {!loading && !error && !caseData && (
            <div className="text-center py-8">
              <p className="text-sm text-sigap-textTertiary mt-2">
                Detail laporan tidak tersedia untuk publik demi melindungi privasi
                pelapor.
              </p>
            </div>
          )}

          {!loading && caseData && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-sigap-textTertiary">ID Kasus</p>
                  <p className="font-medium text-sigap-textPrimary">{caseData.id}</p>
                </div>
                <span
                  className="inline-flex items-center px-3 py-1 rounded text-sm font-semibold"
                  style={{
                    backgroundColor: statusColor(caseData.status) + "20",
                    color: statusColor(caseData.status),
                  }}
                >
                  {statusLabel(caseData.status)}
                </span>
              </div>

              <div>
                <p className="text-sm text-sigap-textTertiary">Tanggal Laporan</p>
                <p className="font-medium text-sigap-textPrimary">
                  {new Date(caseData.created_at).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="rounded-lg border border-sigap-border p-4">
                <p className="text-sm text-sigap-textTertiary">Wilayah</p>
                <p className="font-medium text-sigap-textPrimary">
                  {caseData.generalized_location ?? "Lokasi di luar wilayah tercatat"}
                </p>
              </div>

              <div className="pt-4 border-t border-sigap-border">
                <a
                  href="/peta"
                  className="text-sm text-sigap-primary hover:underline flex items-center gap-1"
                >
                  ← Kembali ke Daftar Kasus
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
