import type { PriorityBreakdownItem } from "../types";
import { StatusBadge } from "./StatusBadge";
import "../reference-layout.css";

interface PriorityScorePanelProps {
  score: number | null;
  breakdown: PriorityBreakdownItem[];
  confidence?: number | null;
  modelVersion?: string;
  baseScore?: number | null;
  onOverride?: () => void;
}

export const PriorityScorePanel = ({
  score,
  breakdown,
  confidence,
  modelVersion,
  baseScore,
  onOverride,
}: PriorityScorePanelProps) => {
  const validScore = score != null && Number.isFinite(score);
  const hasConfidence =
    confidence != null &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1;
  const confidenceText = hasConfidence
    ? `Keyakinan penilaian ${confidence! >= 0.8 ? "tinggi" : confidence! >= 0.5 ? "sedang" : "rendah"}`
    : "Keyakinan penilaian belum tersedia";
  const base =
    baseScore ??
    (breakdown.length
      ? breakdown.reduce((sum, part) => sum + part.value, 0)
      : null);
  return (
    <section className="ref-card">
      <div className="ref-card-head">
        <div>
          <h2>Prioritas penanganan</h2>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              style={{
                font: "600 43px 'IBM Plex Mono',monospace",
                color: "#0a5c50",
              }}
            >
              {validScore ? score : "—"}
            </span>
            <small>/ 100</small>
            {hasConfidence && (
              <StatusBadge
                tone={
                  hasConfidence
                    ? confidence! >= 0.8
                      ? "success"
                      : "warning"
                    : "neutral"
                }
                label={confidenceText}
              />
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono">
            {modelVersion
              ? `Rumus penilaian versi ${modelVersion}`
              : "Versi rumus belum tersedia"}
          </p>
          {onOverride && (
            <button className="ref-button" onClick={onOverride}>
              Ubah prioritas
            </button>
          )}
        </div>
      </div>
      <p className="text-sm mb-3">
        Nilai ini membantu mengurutkan laporan yang perlu ditangani lebih
        dahulu. Rincian di bawah menunjukkan kontribusi tiap pertimbangan;
        kondisi lapangan tetap perlu diperiksa saat menetapkan pekerjaan.
      </p>
      {breakdown.map((part, index) => (
        <div className="ref-score-line" key={index}>
          <span>{part.label}</span>
          <div className="ref-progress">
            <i
              style={{
                width: `${part.max > 0 ? Math.max(0, Math.min(100, (part.value / part.max) * 100)) : 0}%`,
              }}
            />
          </div>
          <b className="font-mono">+{Math.round(part.value * 100) / 100}</b>
        </div>
      ))}
      {!breakdown.length && (
        <p>
          Rincian perhitungan belum tersedia. Gunakan bukti laporan dan hasil
          pemeriksaan lapangan untuk menilai kebutuhan penanganan.
        </p>
      )}
      {base != null && validScore && Math.abs(base - score!) > 0.01 && (
        <p className="mt-3 text-sm">
          Nilai yang digunakan saat ini adalah {score}, berbeda dari jumlah
          komponen dasar {Math.round(base * 100) / 100}. Periksa riwayat
          perubahan untuk memahami alasan perbedaannya.
        </p>
      )}{" "}
    </section>
  );
};
