import React from 'react';
import { Outlet } from 'react-router-dom';

const navItems = ['Ringkasan', 'Peta & Daftar', 'Statistik', 'Metodologi'];

interface PublicLayoutProps {
  children?: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9FAF8' }}>
      <header style={{
        height: 60,
        backgroundColor: 'white',
        borderBottom: '1px solid #E4E7E2',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            backgroundColor: '#0F7A6B',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
          }}>
            P
          </div>
          <span style={{
            padding: '4px 8px',
            backgroundColor: '#E2F1EE',
            color: '#0F7A6B',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
          }}>
            Portal Publik
          </span>
        </div>

        <nav style={{
          display: 'flex',
          gap: 24,
          marginLeft: 48,
        }}>
          {navItems.map((item, i) => (
            <span
              key={item}
              style={{
                fontSize: 14,
                fontWeight: i === 1 ? 600 : 500,
                color: i === 1 ? '#0F7A6B' : '#3A3F45',
                cursor: 'pointer',
                paddingBottom: i === 1 ? 2 : 0,
                borderBottom: i === 1 ? '2px solid #0F7A6B' : '2px solid transparent',
              }}
            >
              {item}
            </span>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <button style={{
          padding: '8px 16px',
          border: '1px solid #E4E7E2',
          borderRadius: 8,
          backgroundColor: 'white',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          marginRight: 8,
        }}>
          Masuk
        </button>
        <button style={{
          padding: '8px 16px',
          backgroundColor: '#0F7A6B',
          border: 'none',
          borderRadius: 8,
          color: 'white',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}>
          Buat laporan
        </button>
      </header>

      <main style={{ padding: 24 }}>
        {children ?? <Outlet />}
      </main>

      <footer style={{
        padding: '16px 24px',
        borderTop: '1px solid #E4E7E2',
        fontSize: 12,
        color: '#8A9099',
      }}>
        Data laporan telah dianonimisasi untuk melindungi privasi pelapor.
      </footer>
    </div>
  );
}
