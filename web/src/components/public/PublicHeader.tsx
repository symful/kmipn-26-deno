import React from 'react';
import { colors, spacing } from '../../theme/tokens';

const navItems = ['Ringkasan', 'Peta & Daftar', 'Statistik', 'Metodologi'];

interface PublicHeaderProps {
  activeNavIndex?: number;
  onNavClick?: (index: number) => void;
  onMasukClick?: () => void;
  onBuatLaporanClick?: () => void;
}

export function PublicHeader({
  activeNavIndex = 1,
  onNavClick,
  onMasukClick,
  onBuatLaporanClick,
}: PublicHeaderProps) {
  return (
    <header
      style={{
        height: 60,
        backgroundColor: 'white',
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${spacing.lg}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            backgroundColor: colors.primary,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          P
        </div>
        <span
          style={{
            padding: '4px 8px',
            backgroundColor: '#E2F1EE',
            color: colors.primary,
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
          }}
        >
          Portal Publik
        </span>
      </div>

      <nav
        style={{
          display: 'flex',
          gap: 24,
          marginLeft: 48,
        }}
      >
        {navItems.map((item, i) => (
          <button
            key={item}
            type="button"
            onClick={() => onNavClick?.(i)}
            style={{
              fontSize: 14,
              fontWeight: i === activeNavIndex ? 600 : 500,
              color: i === activeNavIndex ? colors.primary : colors.textSecondary,
              cursor: 'pointer',
              paddingBottom: i === activeNavIndex ? 2 : 0,
              borderBottom: i === activeNavIndex
                ? `2px solid ${colors.primary}`
                : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
            }}
          >
            {item}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onMasukClick}
          style={{
            padding: '8px 16px',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            backgroundColor: 'white',
            fontSize: 14,
            fontWeight: 500,
            color: colors.textSecondary,
            cursor: 'pointer',
          }}
        >
          Masuk
        </button>
        <button
          type="button"
          onClick={onBuatLaporanClick}
          style={{
            padding: '8px 16px',
            backgroundColor: colors.primary,
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Buat Laporan
        </button>
      </div>
    </header>
  );
}
