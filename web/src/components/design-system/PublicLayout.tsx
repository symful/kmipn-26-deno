import { Link, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { SubmitReport } from "../../pages/SubmitReport";
import "../../reference-layout.css";

export const PublicLayout = ({ children }: { children: ReactNode }) => {
  const [reportOpen, setReportOpen] = useState(false);
  const { pathname } = useLocation();
  const links = [
    ["/ringkasan", "Ringkasan", ["/ringkasan"]],
    ["/peta", "Peta & Daftar", ["/", "/peta", "/cases"]],
    ["/statistics", "Statistik Publik", ["/statistics", "/statistik"]],
    ["/methodology", "Metodologi", ["/methodology", "/metodologi"]],
  ] as const;
  return (
    <div className="ref-public">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Langsung ke konten utama
      </a>
      <header className="ref-public-header">
        <Link to="/" className="ref-brand">
          <span className="ref-logo">S</span>
          <div>
            <b>SIGAP</b>
            <small>PantauDesa</small>
          </div>
        </Link>
        <span className="rounded-full bg-[#eef0ec] text-[#616770] text-[10px] font-semibold px-[9px] py-1">
          ● Portal Publik
        </span>
        <nav aria-label="Navigasi utama">
          {links.map(([path, label, aliases]) => (
            <Link
              key={path}
              to={path}
              className={
                (aliases as readonly string[]).includes(pathname)
                  ? "active"
                  : ""
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ref-public-actions">
          <Link to="/login" className="ref-button">
            Masuk Admin
          </Link>
          <Link
            to="/submit"
            className="ref-button primary"
            onClick={(event) => {
              if (
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault();
                setReportOpen(true);
              }
            }}
          >
            + Lapor Masalah
          </Link>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)}>
        <SubmitReport onClose={() => setReportOpen(false)} />
      </Modal>
    </div>
  );
};
