import { Link } from "react-router-dom";
import { colors } from "../../theme/tokens";

export const RtRwTraining = () => {
  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SIGAP</h1>
              <p className="text-xs text-sigap-textMuted">
                Pelatihan RT/RW
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/verify"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Verifikasi Laporan
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Pelatihan SIGAP untuk RT/RW
        </h1>
        <p className="text-sigap-textSecondary mb-8">
          Panduan lengkap untuk pejabat RT dan RW dalam menggunakan sistem SIGAP
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">1. Apa itu SIGAP?</h2>
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <p className="text-sigap-textSecondary mb-4">
              <strong>SIGAP (Sistem Informasi Gestion Area Penyakit)</strong> adalah
              platform digital untuk pemetaan dan pemantauan pembangunan desa.
              Sistem ini membantu mencatat, melacak, dan menyelesaikan laporan
              kerusakan infrastruktur di lingkungan Anda.
            </p>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-sigap-background p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Tujuan SIGAP</h3>
                <ul className="text-sm text-sigap-textSecondary space-y-1">
                  <li>• Memetakan kerusakan infrastruktur</li>
                  <li>• Mempercepat proses perbaikan</li>
                  <li>• Transparansi laporan masyarakat</li>
                  <li>• Koordinasi antar tingkat pemerintah</li>
                </ul>
              </div>
              <div className="bg-sigap-background p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Peran RT/RW</h3>
                <ul className="text-sm text-sigap-textSecondary space-y-1">
                  <li>• Memverifikasi laporan kerusakan</li>
                  <li>• Memberikan konfirmasi di lapangan</li>
                  <li>• Melaporkan kerusakan baru</li>
                  <li>• Memantau status perbaikan</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">
            2. Cara Memverifikasi Laporan
          </h2>
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <p className="text-sigap-textSecondary mb-4">
              Sebagai RT/RW, tugas utama Anda adalah{" "}
              <strong>memverifikasi laporan kerusakan</strong> yang masuk ke
              sistem. Berikut langkah-langkahnya:
            </p>

            <div className="space-y-4">
              <StepCard
                number={1}
                title="Terima Tautan Verifikasi"
                description="Anda akan menerima tautan verifikasi melalui SMS atau WhatsApp dari sistem SIGAP. Tautan berisi token unik untuk mengakses laporan."
              />
              <StepCard
                number={2}
                title="Buka Tautan"
                description="Klik tautan yang dikirimkan. Anda akan diarahkan ke halaman verifikasi SIGAP."
              />
              <StepCard
                number={3}
                title="Periksa Kondisi di Lapangan"
                description="Kunjungi lokasi yang disebutkan dalam laporan. Periksa apakah kerusakan benar-benar ada dan catat kondisi sebenarnya."
              />
              <StepCard
                number={4}
                title="Berikan Keputusan"
                description="Pilih 'Dikonfirmasi' jika kerusakan benar ada, atau 'Ditolak' jika laporan tidak valid. Berikan alasan yang jelas."
              />
              <StepCard
                number={5}
                title="Kirim Verifikasi"
                description="Klik tombol 'Kirim Verifikasi' untuk提交 keputusan Anda ke sistem."
              />
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">
            3. Memahami Dashboard SIGAP
          </h2>
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <p className="text-sigap-textSecondary mb-4">
              Dashboard SIGAP menampilkan semua laporan kerusakan yang masuk.
              Berikut elemen-elemen utama yang perlu Anda ketahui:
            </p>

            <div className="space-y-4">
              <div className="border border-sigap-border rounded-lg p-4">
                <h3 className="font-semibold text-sigap-primary mb-2">
                  Status Laporan
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors.perluTindakan }}
                    />
                    <span>Perlu Tindakan - Laporan baru</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors.diproses }}
                    />
                    <span>Sedang Diproses - Dalam penanganan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors.selesai }}
                    />
                    <span>Selesai - Sudah diperbaiki</span>
                  </div>
                </div>
              </div>

              <div className="border border-sigap-border rounded-lg p-4">
                <h3 className="font-semibold text-sigap-primary mb-2">
                  Informasi Laporan
                </h3>
                <ul className="text-sm text-sigap-textSecondary space-y-1">
                  <li>
                    <strong>Kategori:</strong> Jenis kerusakan (jalan, drainase,
                    jembatan, dll)
                  </li>
                  <li>
                    <strong>Deskripsi:</strong> Penjelasan detail dari pelapor
                  </li>
                  <li>
                    <strong>Foto:</strong> Bukti foto kerusakan dari pelapor
                  </li>
                  <li>
                    <strong>Koordinat:</strong> Lokasi tepat di peta
                  </li>
                  <li>
                    <strong>Tanggal:</strong> Kapan laporan dibuat
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">4. Best Practice</h2>
          <div className="bg-white rounded-lg p-6 border border-sigap-border">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-success-50 p-4 rounded-lg border border-success-100">
                <h3 className="font-semibold text-success-700 mb-2">✓ Lakukan</h3>
                <ul className="text-sm text-success-600 space-y-1">
                  <li>• Verifikasi laporan dalam 1x24 jam</li>
                  <li>• Datang langsung ke lokasi</li>
                  <li>• Berikan alasan yang detail</li>
                  <li>• Dokumentasikan dengan foto</li>
                  <li>• Laporkan jika ada kendala</li>
                </ul>
              </div>
              <div className="bg-danger-50 p-4 rounded-lg border border-danger-100">
                <h3 className="font-semibold text-danger-700 mb-2">✗ Hindari</h3>
                <ul className="text-sm text-danger-600 space-y-1">
                  <li>• Memverifikasi tanpa ke lokasi</li>
                  <li>• Memberikan alasan kosong</li>
                  <li>• Menunda verifikasi terlalu lama</li>
                  <li>• Menolak tanpa alasan jelas</li>
                  <li>• Mengabaikan laporan masyarakat</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">5. Pertanyaan Umum</h2>
          <div className="bg-white rounded-lg p-6 border border-sigap-border space-y-4">
            <FaqItem
              question="Bagaimana jika lokasi sulit diakses?"
              answer="Coba verifikasi dari titik terdekat yang memungkinkan. Jika benar-benar tidak bisa diakses, berikan alasan di sistem dan minta bantuan tetangga atau warga sekitar untuk dokumentasi."
            />
            <FaqItem
              question="Apa yang harus dilakukan jika laporan tidak jelas?"
              answer="Hubungi pelapor melalui nomor yang tertera untuk meminta klarifikasi. Jika tidak bisa dihubungi, verifikasi berdasarkan informasi yang ada dan catat ketidakjelasan tersebut."
            />
            <FaqItem
              question="Berapa lama waktu verifikasi?"
              answer="Idealnya, verifikasi dilakukan dalam 1x24 jam setelah laporan masuk. Namun, jika ada kendala, segera hubungi admin daerah."
            />
            <FaqItem
              question="Bagaimana jika saya tidak setuju dengan keputusan petugas?"
              answer="Setiap keputusan sudah tercatat dalam sistem. Jika ada keberatan, silakan hubungi admin daerah atau sampaikan melalui fitur komentar yang tersedia."
            />
          </div>
        </section>

        <section className="mb-10">
          <div
            className="rounded-lg p-8 text-center text-white"
            style={{ backgroundColor: colors.primary }}
          >
            <h2 className="text-2xl font-bold mb-2">Siap Memulai?</h2>
            <p className="mb-4 opacity-90">
              Akses menu Verifikasi Laporan untuk memproses laporan kerusakan
              dari masyarakat.
            </p>
            <Link
              to="/verify"
              className="inline-block px-6 py-3 bg-white text-sigap-primary font-semibold rounded-lg hover:bg-opacity-90 transition-colors"
            >
              Verifikasi Laporan
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
};

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ backgroundColor: colors.primary }}
      >
        {number}
      </div>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-sigap-textSecondary">{description}</p>
      </div>
    </div>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="border-b border-sigap-border pb-4 last:border-0 last:pb-0">
      <h3 className="font-semibold mb-2">{question}</h3>
      <p className="text-sm text-sigap-textSecondary">{answer}</p>
    </div>
  );
}
