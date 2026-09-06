import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import type { Report } from "../types";

export interface MapDrawerProps {
  report: Report | null;
  open: boolean;
  onClose: () => void;
  publicMap?: boolean;
}

export function MapDrawer({
  report,
  open,
  onClose,
  publicMap = true,
}: MapDrawerProps) {
  if (!report || !open) return null;
  const photo = report.photo_urls?.[0];
  return (
    <aside role="dialog" aria-label="Detail kasus" className="ref-map-drawer">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-sigap-textTertiary">
          {report.id}
        </span>
        <button
          className="ref-button"
          aria-label="Tutup detail cepat"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h2>{report.title || report.description || "Kasus"}</h2>
      {photo ? (
        <figure>
          <img
            src={photo}
            alt={report.title || "Bukti laporan"}
            style={{
              width: "100%",
              aspectRatio: "1.8",
              borderRadius: 8,
              objectFit: "cover",
            }}
          />
          <figcaption className="text-[9px] text-sigap-textMuted mt-1">
            BUKTI UNGGAHAN
          </figcaption>
        </figure>
      ) : (
        <div className="ref-public-evidence-empty">
          Bukti foto belum tersedia.
        </div>
      )}
      <p style={{ margin: "15px 0" }}>
        {(!publicMap && report.address_area) ||
          report.village_name ||
          report.kelurahan ||
          "Alamat belum tercatat"}
        {!!report.supporting_count && (
          <>
            . {report.supporting_count} laporan lain telah digabungkan karena
            membahas kejadian yang sama.
          </>
        )}
      </p>
      <StatusBadge status={report.status} />
      <div
        style={{ font: "600 43px 'IBM Plex Mono',monospace", color: "#0a5c50" }}
      >
        {report.priority_score ?? "—"}
        <small className="text-xs text-sigap-textTertiary"> / 100</small>
      </div>
      <p>{report.description}</p>
      <Link
        className="ref-button primary block text-center"
        style={{ marginTop: 20 }}
        to={`/system/cases/${report.id}`}
      >
        Buka detail kasus ↗
      </Link>
    </aside>
  );
}
