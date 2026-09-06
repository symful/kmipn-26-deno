import { useEffect, useState } from "react";
import { Modal } from "./design-system/Modal";
import { downloadBlob } from "../lib/download";

export function PdfPreviewDialog({
  document,
  onClose,
}: {
  document: { blob: Blob; filename: string } | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!document) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(document.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [document]);
  return (
    <Modal open={Boolean(document)} onClose={onClose} size="wide">
      <section style={{ padding: 25, overflowY: "auto" }}>
        <div className="ref-card-head">
          <h2 style={{ fontSize: 19 }}>Tinjau laporan sebelum menyimpan</h2>
          <button
            className="ref-button"
            onClick={onClose}
            aria-label="Tutup pratinjau PDF"
          >
            ×
          </button>
        </div>
        <p style={{ marginBottom: 15 }}>
          Periksa isi laporan pada pratinjau. Gunakan kontrol penampil untuk
          mencetak, atau pilih Simpan PDF untuk menyimpan salinan dokumen.
        </p>
        {url && (
          <iframe
            title="Pratinjau laporan PDF"
            src={url}
            style={{
              width: "100%",
              height: "50vh",
              border: "1px solid #dce2de",
              borderRadius: 6,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 15,
          }}
        >
          <button className="ref-button" onClick={onClose}>
            Tutup
          </button>
          <button
            className="ref-button primary"
            disabled={!document || !url}
            onClick={() => {
              if (document) downloadBlob(document.blob, document.filename);
            }}
          >
            Simpan PDF
          </button>
        </div>
      </section>
    </Modal>
  );
}
