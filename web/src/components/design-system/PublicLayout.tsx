import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface PublicLayoutProps {
  children: ReactNode;
}

export const PublicLayout = ({ children }: PublicLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-sigap-background">
      <header className="bg-white border-b border-neutral-200 px-4 md:px-7 py-3 md:py-[15px]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-[7px] bg-sigap-primary flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <span className="text-base font-bold tracking-tight text-sigap-textPrimary">
            PantauDesa
          </span>
          <span className="text-xs text-sigap-textTertiary bg-neutral-100 rounded px-2 py-0.5 ml-1">
            Portal Publik
          </span>
        </div>
        <nav className="hidden md:flex gap-6 text-sm text-sigap-textTertiary mt-3 ml-10">
          <Link to="/" className="hover:text-sigap-primary transition-colors">
            Beranda
          </Link>
          <Link to="/public/cases" className="hover:text-sigap-primary transition-colors">
            Peta & Daftar
          </Link>
          <Link to="/public/statistics" className="hover:text-sigap-primary transition-colors">
            Statistik
          </Link>
          <Link to="/methodology" className="hover:text-sigap-primary transition-colors">
            Metodologi
          </Link>
        </nav>
        <nav className="flex md:hidden gap-4 text-xs text-sigap-textTertiary mt-3 overflow-x-auto">
          <Link to="/" className="hover:text-sigap-primary transition-colors whitespace-nowrap">
            Beranda
          </Link>
          <Link to="/public/cases" className="hover:text-sigap-primary transition-colors whitespace-nowrap">
            Peta & Daftar
          </Link>
          <Link to="/public/statistics" className="hover:text-sigap-primary transition-colors whitespace-nowrap">
            Statistik
          </Link>
          <Link to="/methodology" className="hover:text-sigap-primary transition-colors whitespace-nowrap">
            Metodologi
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-white border-t border-neutral-200 px-4 md:px-7 py-6 md:py-8 mt-auto">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-[7px] bg-sigap-primary flex items-center justify-center text-white font-bold text-sm">
                P
              </div>
              <span className="text-base font-bold tracking-tight text-sigap-textPrimary">
                PantauDesa
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-sigap-textPrimary mb-2">
                Tentang SIGAP
              </h3>
              <p className="text-xs md:text-sm text-sigap-textSecondary leading-relaxed max-w-2xl">
                SIGAP (Sistem Informasi Gestion Área Penyakit) adalah platform pemetaan dan monitoring
                pembangunan desa yang memungkinkan warga untuk melaporkan dan memantau berbagai masalah
                pembangunan di lingkungan mereka. Laporan diproses melalui verifikasi berlapis untuk
                memastikan akurasi dan ditindaklanjuti oleh instansi pemerintah terkait.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <p className="text-xs text-sigap-textMuted text-center md:text-left">
              &copy; {new Date().getFullYear()} SIGAP - Sistem Informasi Gestion Área Penyakit
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
