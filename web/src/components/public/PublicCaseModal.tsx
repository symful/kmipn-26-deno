import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { PublicReport } from "../../types";
import { StatusBadge } from "../StatusBadge";

export function PublicCaseModal({
  report,
  onClose,
}: {
  report: PublicReport | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!report) return;
    let active = true;
    setDescription("");
    setError("");
    setLoading(true);
    dialog.current?.showModal();
    api
      .publicReport(report.id)
      .then((detail) => {
        if (active) setDescription(detail.description || "");
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat detail publik");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      dialog.current?.close();
    };
  }, [report]);
  if (!report) return null;
  return (
    <dialog
      ref={dialog}
      className="ref-public-dialog"
      aria-labelledby="public-progress-heading"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="ref-card-head">
        <h2 id="public-progress-heading">Progres penanganan fasilitas</h2>
        <button
          className="ref-button"
          aria-label="Tutup dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <StatusBadge
        tone="neutral"
        label={`${report.category?.name || "Fasilitas"} · ${report.general_wilayah || "Wilayah belum tersedia"}`}
      />
      <h2 style={{ margin: "15px 0" }}>
        {report.title || report.category?.name}
      </h2>
      {report.moderated_photo_url ? (
        <figure>
          <img
            className="w-full rounded-lg object-cover"
            style={{ aspectRatio: "1.8" }}
            src={report.moderated_photo_url}
            alt={`Bukti publik ${report.title || "fasilitas"}`}
          />
          <figcaption className="text-[9px] text-sigap-textMuted mt-1">
            Foto laporan untuk portal publik
          </figcaption>
        </figure>
      ) : (
        <div className="ref-public-evidence-empty">
          Foto publik belum tersedia.
        </div>
      )}
      <div className="flex gap-2.5 items-center" style={{ margin: "15px 0" }}>
        <StatusBadge status={report.status} />
        <small>
          {report.supporting_count
            ? `${report.supporting_count} laporan lain membahas kejadian ini.`
            : "Laporan utama"}
        </small>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p>
          {loading
            ? "Memuat deskripsi…"
            : description || "Deskripsi belum tersedia."}
        </p>
      )}
      <div className="ref-notice" style={{ marginTop: 16 }}>
        {["resolved", "closed"].includes(report.status)
          ? "Admin telah menutup proses penanganan laporan ini."
          : report.status === "in_progress"
            ? "Petugas sedang menangani laporan ini. Periksa kembali halaman ini untuk mengikuti perkembangannya."
            : "Admin masih menyiapkan tindak lanjut laporan. Halaman ini akan menampilkan perubahan status setelah petugas atau admin memperbarui penanganan."}
        <br />
        Portal ini menampilkan gambaran lokasi untuk membantu Anda mengenali
        wilayah laporan.
      </div>
    </dialog>
  );
}
