import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/design-system/PublicLayout";

export const Methodology = () => {
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Bagaimana SIGAP Bekerja
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            SIGAP adalah platform pemetaan dan monitoring pembangunan desa yang
            memungkinkan warga untuk melaporkan berbagai masalah pembangunan
            di lingkungan mereka. Berikut adalah alur pelaporan dari warga
            hingga laporan terverifikasi:
          </p>
          <ol className="space-y-3 list-decimal list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Warga Melaporkan</strong> — Warga
              mengirimkan laporan masalah pembangunan melalui aplikasi dengan memilih
              kategori, lokasi, dan menambahkan foto/deskripsi.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Verifikasi Awal (RT/RW)</strong> —{" "}
              Laporan ditinjau oleh RT atau RW setempat untuk memastikan
              kebenarannya.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pra-Verifikasi AI</strong> — Sistem
              AI melakukan analisis awal terhadap laporan untuk mendeteksi
              potensi duplikasi atau laporan tidak valid.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Survei Lapangan</strong> —{" "}
              Surveyor ditugaskan untuk melakukan verifikasi langsung ke lokasi.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Validasi Verifikator</strong> —{" "}
              Verifikator memastikan kelengkapan dan keakuratan data sebelum
              laporan diproses lebih lanjut.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pengalihan ke Instansi</strong> —{" "}
              Laporan yang valid diteruskan ke instansi pemerintah terkait untuk
              ditindaklanjuti.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pemantauan & Pelaporan</strong> —{" "}
              Instansi melaporkan perkembangan penanganan. Warga dapat memantau
              status laporan mereka secara real-time.
            </li>
          </ol>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Penilaian Severitas
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            Tingkat keparahan (severity) suatu laporan ditentukan oleh beberapa
            faktor utama:
          </p>
          <ul className="space-y-3 list-disc list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Dampak Langsung</strong> — Seberapa
              langsung dampak masalah terhadap kehidupan warga sehari-hari.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Jumlah Warga Terdampak</strong> —{" "}
              Berapa banyak warga yang terdampak oleh masalah tersebut.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Kebutuhan Mendesak</strong> — Apakah
              masalah tersebut memerlukan penanganan segera atau dapat
              ditunda.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Risiko Keamanan</strong> — Apakah
              masalah tersebut berpotensi menyebabkan kecelakaan atau
              cedera.
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Algoritma Skor Prioritas
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            Setiap laporan mendapatkan skor prioritas yang dihitung menggunakan
            formula berikut:
          </p>
          <div className="bg-neutral-100 rounded-lg p-6 mb-4">
            <code className="text-sm font-mono text-sigap-textPrimary">
              Skor Prioritas = (Severity × 0.4) + (Affected Residents × 0.25) +
              (Region Vulnerability × 0.2) + (SLA Pressure × 0.15)
            </code>
          </div>
          <ul className="space-y-3 list-disc list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Severity (40%)</strong> — Tingkat
              keparahan masalah yang dilaporkan.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Affected Residents (25%)</strong> —{" "}
              Jumlah warga yang terdampak oleh masalah tersebut.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Region Vulnerability (20%)</strong>{" "}
              — Kerentanan wilayah terhadap masalah serupa.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">SLA Pressure (15%)</strong> — Seberapa
              mendesak waktu penanganan berdasarkan batas SLA (Service Level
              Agreement).
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Alur Integrasi Pemerintah
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            Setelah laporan diverifikasi, sistem akan meneruskannya ke instansi
            pemerintah terkait berdasarkan jenis dan lokasi masalah:
          </p>
          <ol className="space-y-3 list-decimal list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Klasifikasi Instansi</strong> — Sistem
              menentukan instansi mana yang bertanggung jawab berdasarkan
              kategori masalah (infrastruktur, kesehatan, lingkungan, dll).
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pengiriman Otomatis</strong> — Laporan
              diteruskan secara otomatis melalui sistem integrasi ke instansi
              terkait.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Penerimaan Tugas</strong> — Instansi
              menerima dan menugaskan personil untuk menangani laporan.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pelaporan Kemajuan</strong> — Instansi
              memberikan pembaruan status secara berkala hingga masalah
              terselesaikan.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Konfirmasi Penyelesaian</strong> — Warga
              dapat mengkonfirmasi apakah masalah sudah teratasi dengan
              memverifikasi sendiri di lapangan.
            </li>
          </ol>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Cakupan Layanan
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            SIGAP mencakup pelaporan dan pemantauan berbagai aspek pembangunan desa
            yang meliputi:
          </p>
          <ul className="space-y-3 list-disc list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Infrastruktur Desa</strong> — Jalan,
              jembatan, drainase, dan fasilitas umum lainnya.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Lingkungan</strong> — Pengelolaan
              sampah, sanitasi, dan kebersihan lingkungan.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Kesehatan Masyarakat</strong> —
              Akses layanan kesehatan, posyandu, dan pencegahan penyakit.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pendidikan</strong> — Kondisi
              bangunan sekolah, fasilitas belajar, dan akses pendidikan.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Kesejahteraan Sosial</strong> —
              Program bantuan sosial dan pemberdayaan masyarakat.
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Tata Kelola Data
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            SIGAP menerapkan kerangka tata kelola data yang komprehensif untuk
            memastikan integritas, keamanan, dan akuntabilitas data:
          </p>
          <ul className="space-y-3 list-disc list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Integritas Data</strong> — Semua laporan
              melalui proses verifikasi berlapis untuk memastikan akurasi.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Kontrol Akses</strong> — Akses berbasis
              peran memastikan hanya personel berwenang yang dapat mengelola data.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Jejak Audit</strong> — Setiap
              perubahan data dicatat dan dapat ditelusuri.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Retensi Data</strong> — Data disimpan
              sesuai regulasi dan dihapus setelah periode retensi.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Interoperabilitas</strong> — Data dapat
              diintegrasikan dengan sistem pemerintah daerah.
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 mb-6">
          <h2 className="text-2xl font-bold text-sigap-textPrimary mb-4">
            Kebijakan Privasi
          </h2>
          <p className="text-sigap-textSecondary leading-relaxed mb-4">
            SIGAP berkomitmen untuk melindungi privasi dan data pribadi warga
            sesuai dengan Undang-Undang Perlindungan Data Pribadi (UU PDP).
            Berikut adalah prinsip utama dalam penanganan data:
          </p>
          <ul className="space-y-3 list-disc list-inside text-sigap-textSecondary">
            <li>
              <strong className="text-sigap-textPrimary">Pengumpulan Minimal</strong> — Kami
              hanya mengumpulkan data yang diperlukan untuk memproses laporan
              pembangunan.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Persetujuan Eksplisit</strong> — Warga
              harus memberikan persetujuan sebelum data mereka dikumpulkan
              dan diproses.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Keamanan Data</strong> — Semua data
              dienkripsi dan disimpan dengan standar keamanan tertinggi.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Hak Akses</strong> — Warga dapat
              mengakses, memperbaiki, atau menghapus data pribadi mereka
              kapan saja.
            </li>
            <li>
              <strong className="text-sigap-textPrimary">Pembatasan Penggunaan</strong> — Data
              hanya digunakan untuk tujuan penanganan laporan pembangunan dan
              tidak dibagikan ke pihak ketiga tanpa izin.
            </li>
          </ul>
        </div>

        <div className="text-center">
          <Link
            to="/"
            className="text-sm text-sigap-primary hover:underline"
          >
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
};
