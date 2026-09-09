import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { StatusBadge } from "../components/StatusBadge";
import { SigapCard } from "../components/design-system/Card";
import { EmptyState } from "../components/design-system/EmptyState";
import { ErrorRetry } from "../components/design-system/ErrorRetry";
import {
  WARGA_SELF_CLOSABLE_STATUSES,
} from "../lib/report-statuses";
import {
  colors,
  spacing,
  fontWeights,
  fontSizes,
} from "../theme/tokens";
import type { Report } from "../types";

export const WargaReportDetail = () => {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const r = await api.report(id);
      setReport(r);
    } catch (e) {
      const err = e as Error & { status?: number };
      setErrorCode(err.status ?? null);
      setReport(null);
      if (err.status === 403) {
        setError("Anda tidak memiliki akses ke laporan ini.");
      } else if (err.status === 404) {
        setError("Laporan tidak ditemukan.");
      } else {
        setError(err.message || "Gagal memuat laporan.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const isWarga = user?.role === "WARGA";
  const canSelfClose =
    isWarga &&
    report != null &&
    (WARGA_SELF_CLOSABLE_STATUSES as readonly string[]).includes(report.status);
  const isClosed = report?.status === "closed";

  const handleSubmitClose = async () => {
    if (!report || reason.trim().length < 10) return;
    setSubmitting(true);
    try {
      const { toast } = await import("../components/Toast");
      await api.selfCloseReport(report.id, { reason: reason.trim() });
      toast.success("Laporan ditandai selesai");
      setReason("");
      await load();
    } catch (e) {
      const { toast } = await import("../components/Toast");
      toast.error((e as Error).message || "Gagal menutup laporan.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", backgroundColor: colors.bgPage }}>
        <TopBar />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 20px",
          }}
        >
          <p style={{ fontSize: fontSizes["12"], color: colors.textMuted }}>
            Memuat...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100dvh", backgroundColor: colors.bgPage }}>
        <TopBar />
        <div style={{ padding: "40px 20px", maxWidth: 480, margin: "0 auto" }}>
          <ErrorRetry error={error} onRetry={load} />
          {errorCode && (
            <p
              style={{
                textAlign: "center",
                marginTop: spacing.md,
                fontSize: fontSizes["10"],
                color: colors.textMuted,
              }}
            >
              Kode: {errorCode}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ minHeight: "100dvh", backgroundColor: colors.bgPage }}>
        <TopBar />
        <div style={{ padding: "40px 20px", maxWidth: 480, margin: "0 auto" }}>
          <EmptyState
            icon={<span aria-hidden="true">&#128196;</span>}
            title="Laporan tidak ditemukan"
            subtitle="Laporan yang Anda cari mungkin sudah dihapus atau tidak tersedia."
            action={
              <Link
                to="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: `${spacing.sm} ${spacing.lg}`,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  color: "#fff",
                  fontSize: fontSizes["12"],
                  fontWeight: fontWeights.semibold,
                  textDecoration: "none",
                }}
              >
                Kembali ke beranda
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const createdDate = new Date(report.created_at).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: colors.bgPage }}>
      <TopBar />
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: `${spacing.lg} ${spacing.md} 60px`,
        }}
      >
        <SigapCard>
          <div style={{ marginBottom: spacing.md }}>
            <h1
              style={{
                fontSize: fontSizes["16"],
                fontWeight: fontWeights.bold,
                color: colors.textPrimary,
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {report.title || report.description.slice(0, 80)}
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            <StatusBadge status={report.status} />
            {report.severity != null && (
              <StatusBadge
                tone="warning"
                label={`Keparahan ${report.severity}`}
              />
            )}
          </div>

          <div style={{ marginBottom: spacing.md }}>
            <label
              style={{
                display: "block",
                fontSize: fontSizes["10"],
                fontWeight: fontWeights.semibold,
                color: colors.textLabel,
                marginBottom: 4,
              }}
            >
              Deskripsi
            </label>
            <p
              style={{
                fontSize: fontSizes["12"],
                color: colors.textPrimary,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {report.description}
            </p>
          </div>

          {report.photo_urls && report.photo_urls.length > 0 && (
            <div style={{ marginBottom: spacing.md }}>
              <label
                style={{
                  display: "block",
                  fontSize: fontSizes["10"],
                  fontWeight: fontWeights.semibold,
                  color: colors.textLabel,
                  marginBottom: 8,
                }}
              >
                Foto bukti
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 8,
                }}
              >
                {report.photo_urls.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`Bukti foto ${idx + 1}`}
                      style={{
                        width: "100%",
                        height: 120,
                        objectFit: "cover",
                        borderRadius: 8,
                        border: `1px solid ${colors.borderNeutral}`,
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 0 }}>
            <label
              style={{
                display: "block",
                fontSize: fontSizes["10"],
                fontWeight: fontWeights.semibold,
                color: colors.textLabel,
                marginBottom: 4,
              }}
            >
              Dibuat pada
            </label>
            <p
              style={{
                fontSize: fontSizes["12"],
                color: colors.textSecondary,
                margin: 0,
              }}
            >
              {createdDate}
            </p>
          </div>
        </SigapCard>

        {isClosed && (
          <SigapCard style={{ marginTop: spacing.md }}>
            <p
              style={{
                fontSize: fontSizes["12"],
                color: colors.textSecondary,
                margin: 0,
                fontStyle: "italic",
              }}
            >
              Laporan ini telah ditutup oleh pelapor.
            </p>
          </SigapCard>
        )}

        {canSelfClose && (
          <SigapCard style={{ marginTop: spacing.md }} severity="warning">
            <h2
              style={{
                fontSize: fontSizes["14"],
                fontWeight: fontWeights.semibold,
                color: colors.textPrimary,
                margin: `0 0 ${spacing.sm}`,
              }}
            >
              Tandai Selesai Sendiri
            </h2>
            <p
              style={{
                fontSize: fontSizes["12"],
                color: colors.textSecondary,
                margin: `0 0 ${spacing.md}px`,
                lineHeight: 1.5,
              }}
            >
              Tutup laporan ini karena masalah sudah teratasi sendiri. Petugas
              yang bertugas akan otomatis dibatalkan.
            </p>

            <label
              style={{
                display: "block",
                fontSize: fontSizes["10"],
                fontWeight: fontWeights.semibold,
                color: colors.textLabel,
                marginBottom: 6,
              }}
            >
              Alasan penutupan *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Jelaskan mengapa laporan ini dapat ditutup..."
              style={{
                width: "100%",
                padding: spacing.sm,
                borderRadius: 8,
                border: `1px solid ${colors.borderNeutral}`,
                fontSize: fontSizes["12"],
                color: colors.textPrimary,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p
                style={{
                  fontSize: fontSizes["10"],
                  color: colors.danger,
                  margin: "6px 0 0",
                }}
              >
                Alasan harus minimal 10 karakter.
              </p>
            )}

            <button
              type="button"
              disabled={submitting || reason.trim().length < 10}
              onClick={handleSubmitClose}
              style={{
                marginTop: spacing.md,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: `${spacing.sm}px ${spacing.lg}px`,
                minHeight: 44,
                borderRadius: 8,
                backgroundColor:
                  submitting || reason.trim().length < 10
                    ? colors.textMuted
                    : colors.primary,
                color: "#fff",
                fontSize: fontSizes["12"],
                fontWeight: fontWeights.semibold,
                border: "none",
                cursor:
                  submitting || reason.trim().length < 10
                    ? "not-allowed"
                    : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Mengirim..." : "Tandai Selesai"}
            </button>
          </SigapCard>
        )}
      </main>
    </div>
  );
};

function TopBar() {
  return (
    <header
      style={{
        backgroundColor: colors.bgCard,
        borderBottom: `1px solid ${colors.borderNeutral}`,
        padding: `${spacing.sm} ${spacing.md}`,
        display: "flex",
        alignItems: "center",
        gap: spacing.sm,
      }}
    >
      <Link
        to="/"
        style={{
          fontSize: fontSizes["12"],
          fontWeight: fontWeights.semibold,
          color: colors.primary,
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16 }}>&larr;</span>
        Kembali
      </Link>
      <span
        style={{
          fontSize: fontSizes["12"],
          fontWeight: fontWeights.semibold,
          color: colors.textPrimary,
        }}
      >
        Detail Laporan
      </span>
    </header>
  );
}
