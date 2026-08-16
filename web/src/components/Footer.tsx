import { Link } from "react-router-dom";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0a5c50] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">
                S
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">SIGAP</h2>
                <p className="text-xs text-white/70">PantauDesa</p>
              </div>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">
              Platform pemetaan dan monitoring pembangunan desa untuk transparansi dan akuntabilitas.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-4 text-white/90">Navigasi</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-sm text-white/70 hover:text-white transition-colors">
                  Beranda
                </Link>
              </li>
              <li>
                <Link to="/peta" className="text-sm text-white/70 hover:text-white transition-colors">
                  Daftar Kasus
                </Link>
              </li>
              <li>
                <Link to="/statistics" className="text-sm text-white/70 hover:text-white transition-colors">
                  Statistik
                </Link>
              </li>
              <li>
                <Link to="/methodology" className="text-sm text-white/70 hover:text-white transition-colors">
                  Metodologi
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-4 text-white/90">Informasi</h3>
            <ul className="space-y-2">
              <li>
                <span className="text-sm text-white/70">Kebijakan Privasi</span>
              </li>
              <li>
                <span className="text-sm text-white/70">Syarat & Ketentuan</span>
              </li>
              <li>
                <span className="text-sm text-white/70">Hubungi Kami</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10">
          <p className="text-center text-xs text-white/60">
            &copy; {currentYear} SIGAP PantauDesa. Hak cipta dilindungi.
          </p>
        </div>
      </div>
    </footer>
  );
};
