import { Link } from "react-router-dom";
import { colors } from "../theme/tokens";

export const NotFound = () => {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ backgroundColor: colors.background }}
    >
      <div className="text-center max-w-md mx-auto px-6">
        <div
          className="text-8xl font-bold mb-4"
          style={{ color: colors.primary }}
        >
          404
        </div>
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: colors.textPrimary }}
        >
          Halaman tidak ditemukan
        </h1>
        <p className="text-sm mb-8" style={{ color: colors.textSecondary }}>
          Periksa alamat halaman yang Anda buka, atau kembali ke beranda untuk
          memilih menu yang tersedia.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: colors.primary }}
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
};
