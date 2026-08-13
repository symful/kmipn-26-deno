import { useState } from "react";
import { Link } from "react-router-dom";
import { colors } from "../../theme/tokens";

interface Slide {
  id: number;
  title: string;
  content: string;
  icon: string;
  bgColor: string;
}

const slides: Slide[] = [
  {
    id: 1,
    title: "Selamat Datang di SIGAP",
    content: "SIGAP adalah platform digital untuk pemetaan dan pemantauan kerusakan infrastruktur di lingkungan Anda. Pelatihan ini akan membantu Anda memahami cara memverifikasi laporan kerusakan.",
    icon: "🏠",
    bgColor: colors.primary,
  },
  {
    id: 2,
    title: "Terima Laporan",
    content: "Anda akan menerima tautan verifikasi melalui SMS atau WhatsApp. Tautan berisi token unik untuk mengakses laporan kerusakan dari masyarakat.",
    icon: "📱",
    bgColor: colors.diproses,
  },
  {
    id: 3,
    title: "Kunjungi Lokasi",
    content: "Datang ke lokasi yang disebutkan dalam laporan. Periksa apakah kerusakan benar-benar ada sesuai dengan deskripsi dan foto yang dilampirkan.",
    icon: "📍",
    bgColor: colors.perluTindakan,
  },
  {
    id: 4,
    title: "Berikan Keputusan",
    content: "Pilih 'Dikonfirmasi' jika kerusakan benar ada dan belum diperbaiki. Pilih 'Ditolak' jika laporan tidak valid atau kerusakan sudah diperbaiki.",
    icon: "✅",
    bgColor: colors.selesai,
  },
  {
    id: 5,
    title: "Tulis Alasan",
    content: "Jelaskan keputusan Anda dengan detail. Alasan yang jelas membantu petugas dalam menindaklanjuti laporan dengan tepat.",
    icon: "✍️",
    bgColor: colors.primary,
  },
  {
    id: 6,
    title: "Kirim Verifikasi",
    content: "Klik tombol 'Kirim Verifikasi' untuk mengirimkan keputusan Anda. Verifikasi Anda akan tercatat dalam sistem dan petugas akan segera ditugaskan.",
    icon: "📤",
    bgColor: colors.diproses,
  },
];

export default function VerifyTraining() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const slide = slides[currentSlide]!;
  const progress = ((currentSlide + 1) / slides.length) * 100;

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SIGAP</h1>
              <p className="text-xs text-sigap-textMuted">Pelatihan Verifikasi</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/verify"
              className="text-sm font-medium text-sigap-primary hover:underline"
            >
              Kembali ke Verifikasi
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Pelatihan Verifikasi Laporan
          </h1>
          <p className="text-sigap-textSecondary">
            Pelajari cara memverifikasi laporan kerusakan sebagai RT/RW
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-sigap-border">
          <div className="relative">
            <div
              className="h-2"
              style={{
                backgroundColor: colors.border,
                width: "100%",
              }}
            >
              <div
                className="h-2 transition-all duration-300"
                style={{
                  backgroundColor: slide.bgColor,
                  width: `${progress}%`,
                }}
              />
            </div>

            <div
              className="p-12 text-center min-h-[400px] flex flex-col items-center justify-center"
              style={{
                backgroundColor: `${slide.bgColor}10`,
              }}
            >
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-6"
                style={{
                  backgroundColor: slide.bgColor,
                }}
              >
                {slide.icon}
              </div>
              <h2 className="text-2xl font-bold mb-4">{slide.title}</h2>
              <p className="text-sigap-textSecondary max-w-md text-lg leading-relaxed">
                {slide.content}
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-sigap-surface border-t border-sigap-border">
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="px-4 py-2 rounded-lg font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sigap-background transition-colors"
              >
                ← Sebelumnya
              </button>

              <div className="flex gap-2">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      index === currentSlide
                        ? "bg-sigap-primary"
                        : "bg-sigap-border hover:bg-sigap-textMuted"
                    }`}
                  />
                ))}
              </div>

              {currentSlide < slides.length - 1 ? (
                <button
                  onClick={nextSlide}
                  className="px-4 py-2 rounded-lg font-medium bg-sigap-primary text-white hover:bg-opacity-90 transition-colors"
                >
                  Selanjutnya →
                </button>
              ) : (
                <Link
                  to="/verify"
                  className="px-4 py-2 rounded-lg font-medium bg-sigap-primary text-white hover:bg-opacity-90 transition-colors"
                >
                  Mulai Verifikasi →
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-sigap-border">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: colors.selesai }}
              >
                ✓
              </div>
              <h3 className="font-semibold">Konfirmasi</h3>
            </div>
            <p className="text-sm text-sigap-textSecondary">
              Pilih jika kerusakan benar ada dan perlu ditindaklanjuti
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-sigap-border">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: colors.perluTindakan }}
              >
                ✗
              </div>
              <h3 className="font-semibold">Tolak</h3>
            </div>
            <p className="text-sm text-sigap-textSecondary">
              Pilih jika laporan tidak valid atau sudah diperbaiki
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 border border-sigap-border">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: colors.diproses }}
              >
                ⏱
              </div>
              <h3 className="font-semibold">1x24 Jam</h3>
            </div>
            <p className="text-sm text-sigap-textSecondary">
              Target waktu verifikasi setelah laporan masuk
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sigap-textSecondary mb-4">
            Butuh bantuan lebih lanjut?
          </p>
          <Link
            to="/verify"
            className="inline-block px-6 py-3 rounded-lg font-medium border border-sigap-border hover:bg-sigap-background transition-colors"
          >
            Kembali ke Form Verifikasi
          </Link>
        </div>
      </main>
    </div>
  );
}
