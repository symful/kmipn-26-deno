import { PageHead } from "../components/ReferencePage";

const cards = [
  [
    "01 · Laporan warga",
    "Warga menjelaskan kondisi fasilitas dan melampirkan foto serta titik lokasi. Admin menggunakan bukti ini untuk memahami keluhan dan menentukan informasi tambahan yang diperlukan.",
  ],
  [
    "02 · Pemeriksaan laporan",
    "Admin mencocokkan uraian dengan foto, memeriksa lokasi, dan membandingkan laporan serupa. Hasil pemeriksaan AI membantu menunjukkan bukti yang mendukung atau perbedaan yang perlu dijelaskan; admin kemudian menentukan tindak lanjut.",
  ],
  [
    "03 · Membandingkan laporan",
    "Admin membandingkan lokasi, foto, dan uraian sebelum menggabungkan laporan. Dua laporan yang berdekatan belum tentu membahas kejadian yang sama. Petugas memeriksa kondisi di lapangan bila bukti belum cukup.",
  ],
  [
    "04 · Prioritas yang dapat dijelaskan",
    "Rumus prioritas menggabungkan komponen penilaian untuk membantu admin mengurutkan penanganan. Admin dapat menyesuaikan prioritas dengan mencatat alasan, sehingga pemeriksa berikutnya dapat memahami keputusan tersebut.",
  ],
];
export const Methodology = () => (
  <div className="ref-content">
    <PageHead
      title="Transparan dalam data, jelas dalam keputusan."
      subtitle="Metodologi pemantauan pembangunan desa"
    />
    <div className="ref-grid ref-equal">
      {cards.map(([title, body]) => (
        <section key={title} className="ref-card">
          <h2>{title}</h2>
          <p style={{ marginTop: 12 }}>{body}</p>
        </section>
      ))}
    </div>
    <div className="ref-notice" style={{ marginTop: 20 }}>
      Portal publik menampilkan gambaran lokasi dan perkembangan penanganan.
      Admin dan petugas menggunakan rincian laporan sesuai tugasnya untuk
      menindaklanjuti keluhan.
    </div>
  </div>
);
