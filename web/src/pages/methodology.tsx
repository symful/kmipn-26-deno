export const Methodology = () => {
  return (
    <div className="min-h-screen bg-sigap-background p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg p-8 border border-sigap-border">
          <h1 className="text-2xl font-bold mb-6 text-sigap-textPrimary">Metodologi SIGAP</h1>

          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Cara Kerja SIGAP</h2>
              <p className="text-sigap-textSecondary leading-relaxed mb-4">
                SIGAP (Sistem Informasi Pemetaan dan Monitoring Pembangunan Desa) adalah
                platform pelaporan infrastruktur berbasis komunitas yang memungkinkan warga
                dan petugas lapangan melaporkan masalah seperti jalan rusak, jembatan rusak,
                listrik padam, dan problema infrastruktur lainnya di lingkungan mereka.
              </p>
              <p className="text-sigap-textSecondary leading-relaxed">
                Setiap laporan yang masuk akan diproses melalui serangkaian tahapan verifikasi
                berlapis untuk memastikan keakuratan data dan relevansi penanganan. Proses
                dimulai dari laporan warga, kemudian diverifikasi oleh AI, ditinjau oleh
                verifikator, dan disurvei oleh petugas lapangan sebelum diteruskan ke
                pemerintah daerah terkait.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Kategori Masalah</h2>
              <p className="text-sigap-textSecondary leading-relaxed mb-4">
                SIGAP menangani berbagai kategori masalah infrastruktur desa, termasuk namun
                tidak terbatas pada:
              </p>
              <ul className="list-disc list-inside text-sigap-textSecondary space-y-2">
                <li>Jalan rusak atau berlubang</li>
                <li>Jembatan rusak atau berbahaya</li>
                <li>Listrik padam atau instalasi listrik bermasalah</li>
                <li>Saluran air atau irigasi tersumbat</li>
                <li>Bangunan publik yang rusak</li>
                <li>Problema infrastruktur lainnya</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Verifikasi AI</h2>
              <p className="text-sigap-textSecondary leading-relaxed mb-4">
                Setiap laporan yang masuk akan menjalani verifikasi otomatis oleh AI yang
                menganalisis:
              </p>
              <ul className="list-disc list-inside text-sigap-textSecondary space-y-2">
                <li>Konsistensi lokasi GPS dengan metadata EXIF foto</li>
                <li>Deteksi kerusakan dari foto menggunakan model vision-language</li>
                <li>Potensi duplikasi dengan laporan lain di wilayah serupa</li>
                <li>Skor keparahan (severity) berdasarkan bukti visual</li>
              </ul>
              <p className="text-sigap-textSecondary leading-relaxed mt-4">
                Verifikasi AI memberikan rekomendasi, namun keputusan final tetap ada pada
                verifikator atau operator yang berwenang.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Algoritma Prioritas</h2>
              <p className="text-sigap-textSecondary leading-relaxed mb-4">
                Priority score dihitung menggunakan formula berbobot:
              </p>
              <div className="bg-sigap-background rounded-lg p-4 mb-4 font-mono text-sm">
                <p className="text-sigap-textPrimary">
                  Priority = (severity × w1) + (affected_residents × w2) + (region_vulnerability × w3) + (sla_pressure × w4)
                </p>
              </div>
              <p className="text-sigap-textSecondary leading-relaxed">
                Bobot (w1-w4) dapat dikonfigurasi oleh administrator berdasarkan
                kebijakan daerah. Parameter sla_pressure meningkat seiring mendekatnya
                batas waktu SLA (Service Level Agreement). Laporan dengan skor tinggi
                akan mendapatkan prioritas penanganan yang lebih cepat.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Alur Verifikasi Bertahap</h2>
              <p className="text-sigap-textSecondary leading-relaxed mb-4">
                Setelah laporan diverifikasi dan disurvei, data akan diteruskan ke
                sistem pemerintah terkait melalui integrasi outbox:
              </p>
              <ol className="list-decimal list-inside text-sigap-textSecondary space-y-2">
                <li>Laporan disubmit oleh warga atau surveyor melalui aplikasi</li>
                <li>AI melakukan assessment awal dan scoring otomatis</li>
                <li>Verifikator meninja dan memvalidasi laporan</li>
                <li>RT/RW setempat melakukan verifikasi fakta</li>
                <li>Petugas lapangan melakukan survey实地 untuk konfirmasi</li>
                <li>Laporan dikirim ke Satuan Kerja Perangkat Daerah terkait</li>
                <li>Notifikasi dikirim ke pelapor tentang status penanganan</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Kebijakan Privasi</h2>
              <p className="text-sigap-textSecondary leading-relaxed">
                Lokasi akurat pelapor <strong>tidak ditampilkan</strong> kepada publik.
                Hanya koordinat yang telah digeneralisasi (level kecamatan/kabupaten)
                yang akan ditampilkan di halaman publik untuk melindungi privasi warga.
                Identitas pelapor juga dianonimisasi. Data pribadi hanya dapat diakses
                oleh verifikator dan administrator yang berwenang.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 text-sigap-textPrimary">Integrasi Geospasial</h2>
              <p className="text-sigap-textSecondary leading-relaxed">
                SIGAP menggunakan PostGIS untuk penyimpanan dan analisis data geospasial.
                Setiap laporan dilengkapi koordinat GPS yang memungkinkan pemetaan
                interaktif, analisis klastering, dan identifikasi hotspot kerusakan
                infrastruktur di level desa, kecamatan, hingga kabupaten.
              </p>
            </section>
          </div>

          <div className="pt-6 mt-8 border-t border-sigap-border">
            <a
              href="/"
              className="text-sm text-sigap-primary hover:underline flex items-center gap-1"
            >
              ← Kembali ke Beranda
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
