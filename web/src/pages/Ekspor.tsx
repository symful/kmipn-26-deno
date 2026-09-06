import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { IntegrationsResponse } from "../types/governance";
import { PageHead } from "../components/ReferencePage";
import { StatusBadge } from "../components/StatusBadge";
import { downloadBlob } from "../lib/download";
import { PdfPreviewDialog } from "../components/PdfPreviewDialog";

export const Export = () => {
  const [pdfDocument, setPdfDocument] = useState<{
    blob: Blob;
    filename: string;
  } | null>(null);
  const pdfTrigger = useRef<HTMLButtonElement>(null);
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(
    null,
  );
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [pending, setPending] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [reload, setReload] = useState(0);
  const syncAvailable = (integrations?.available_count ?? 0) > 0;
  useEffect(() => {
    let active = true;
    setError("");
    api
      .integrations()
      .then((data) => {
        if (active) setIntegrations(data);
      })
      .catch((e: Error) => {
        if (active) setError(e.message || "Gagal memuat integrasi");
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const download = async (format: string) => {
    setPending(format);
    setError("");
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "GeoJSON")
        downloadBlob(
          new Blob([JSON.stringify(await api.exportGeojson())], {
            type: "application/geo+json",
          }),
          `sigap-${stamp}.geojson`,
        );
      if (format === "CSV")
        downloadBlob(
          new Blob([await api.exportCsv()], { type: "text/csv;charset=utf-8" }),
          `sigap-${stamp}.csv`,
        );
      if (format === "PDF")
        setPdfDocument({
          blob: await api.exportPdf(),
          filename: `sigap-${stamp}.pdf`,
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ekspor gagal");
    } finally {
      setPending("");
    }
  };
  const sync = async () => {
    if (!syncAvailable) return;
    setSyncing(true);
    setSyncError("");
    try {
      await api.syncIntegrations();
      setReload((n) => n + 1);
    } catch (e) {
      setSyncError(
        e instanceof Error ? e.message : "Sinkronisasi belum tersedia",
      );
    } finally {
      setSyncing(false);
    }
  };
  return (
    <div>
      <PdfPreviewDialog
        document={pdfDocument}
        onClose={() => {
          setPdfDocument(null);
          requestAnimationFrame(() => pdfTrigger.current?.focus());
        }}
      />
      <PageHead
        title="Ekspor & integrasi pemerintah"
        subtitle="Pilih format sesuai kebutuhan: PDF untuk membaca dan meninjau laporan, CSV untuk mengolah data dalam tabel, atau GeoJSON untuk pemetaan. Tinjau isi dokumen sebelum membagikannya kepada instansi terkait."
      />
      {error && (
        <div className="ref-notice mb-4" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => setReload((n) => n + 1)}
          >
            Coba lagi
          </button>
        </div>
      )}
      <div className="ref-grid ref-two">
        <section className="ref-card">
          <h2>Ekspor dokumen standar</h2>
          <p style={{ marginTop: 7 }}>
            {integrations?.record_count ?? "—"} laporan tercatat. Unduhan dari
            halaman ini tidak mengikuti filter peta atau daftar kasus. Cakupan:
            data yang tersedia untuk ekspor.
          </p>
          {[
            [
              "GeoJSON",
              "Buka laporan pada aplikasi peta dengan koordinat dan atributnya. Gunakan format ini untuk membandingkan wilayah serta mengolah data spasial.",
            ],
            [
              "CSV",
              "Olah seluruh catatan ekspor dalam lembar kerja: alamat, status, temuan, keputusan, dan rincian penanganan. Kolom mempertahankan data agar Anda dapat menyaring dan membandingkan laporan.",
            ],
            [
              "PDF",
              "Tinjau tabel laporan, alamat, temuan, keputusan, dan tugas dalam dokumen siap baca. Periksa catatan penting sebelum menyimpan atau mencetak.",
            ],
          ].map(([format, description]) => (
            <div className="ref-integration" key={format}>
              <div>
                <h3>{format}</h3>
                <p>{description}</p>
              </div>
              <button
                ref={format === "PDF" ? pdfTrigger : undefined}
                className="ref-button"
                disabled={!!pending}
                onClick={() => void download(format!)}
              >
                {pending === format
                  ? "Menyiapkan dokumen…"
                  : format === "PDF"
                    ? "Pratinjau PDF"
                    : "Unduh " + format}
              </button>
            </div>
          ))}
        </section>
        <section className="ref-card">
          <div className="ref-card-head">
            <h2>Pengiriman ke sistem instansi</h2>
            <StatusBadge
              tone="neutral"
              label={
                integrations?.available_count ? "Tersedia" : "Belum tersedia"
              }
            />
          </div>
          {integrations?.connectors.map((connector) => (
            <div className="ref-integration" key={connector.id}>
              <div>
                <h3>{connector.name}</h3>
                <p>
                  {connector.last_sync
                    ? new Date(connector.last_sync).toLocaleString("id-ID")
                    : "Belum disinkronkan"}
                </p>
                <small>
                  {connector.records_sent == null
                    ? connector.reason
                    : `${connector.records_sent} data terkirim`}
                </small>
              </div>
              <StatusBadge
                tone="neutral"
                label={
                  connector.configured
                    ? "Belum tersedia"
                    : "Belum dikonfigurasi"
                }
              />
            </div>
          ))}
          {!integrations && !error && <p>Memuat integrasi…</p>}
          <button
            className="ref-button primary"
            disabled={syncing || !syncAvailable}
            aria-describedby={
              !syncAvailable ? "integration-unavailable" : undefined
            }
            onClick={() => void sync()}
          >
            {syncing ? "Menyinkronkan…" : "Kirim pembaruan data"}
          </button>
          {integrations && !syncAvailable && (
            <p
              id="integration-unavailable"
              style={{ marginTop: 12, fontSize: 11 }}
            >
              Sinkronisasi belum tersedia.{" "}
              {integrations.connectors[0]?.reason ||
                "Belum ada konektor pengiriman yang aktif."}{" "}
              Untuk koordinasi saat ini, unduh dokumen dan kirim melalui saluran
              yang digunakan instansi.
            </p>
          )}
          {syncError && (
            <div className="ref-notice mt-4" role="alert">
              {syncError}
            </div>
          )}
          <p style={{ marginTop: 15, fontSize: 10 }}>
            Pengiriman langsung memerlukan sambungan aktif ke sistem penerima.
            Mengunduh dokumen tidak mengirimkan data secara otomatis ke instansi
            lain.
          </p>
        </section>
      </div>
    </div>
  );
};
