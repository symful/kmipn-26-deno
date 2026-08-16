import React from 'react';
import {
  sidebarBg,
  sidebarText,
  sidebarTextHover,
  sidebarTextMuted,
  sidebarDivider,
  sidebarAccent,
  colors,
} from '../../theme/tokens';

export interface NavItem {
  label: string;
  path?: string;
  badge?: number;
  icon?: React.ReactNode;
}

export interface SidebarProps {
  items?: NavItem[];
  activePath?: string;
  onNavigate?: (path: string) => void;
  onHelp?: () => void;
  onLogout?: () => void;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Antrean', path: '/antrean' },
  { label: 'Cases', path: '/cases' },
  { label: 'Laporan', path: '/laporan' },
  { label: 'Notifikasi', path: '/notifikasi' },
  { label: 'Pengaturan', path: '/pengaturan' },
];

const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const AntreanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const CasesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const LaporanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const NotifikasiIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const PengaturanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const HelpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16,17 21,12 16,7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const NAV_ICONS: Record<string, React.ReactNode> = {
  Dashboard: <DashboardIcon />,
  Antrean: <AntreanIcon />,
  Cases: <CasesIcon />,
  Laporan: <LaporanIcon />,
  Notifikasi: <NotifikasiIcon />,
  Pengaturan: <PengaturanIcon />,
};

export function Sidebar({
  items = DEFAULT_NAV_ITEMS,
  activePath,
  onNavigate,
  onHelp,
  onLogout,
}: SidebarProps) {
  const handleItemClick = (path?: string) => {
    if (path && onNavigate) {
      onNavigate(path);
    }
  };

  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        height: '100vh',
        backgroundColor: sidebarBg,
        color: sidebarText,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '20px 16px',
          borderBottom: `1px solid ${sidebarDivider}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <span style={{ fontWeight: 600, fontSize: 15 }}>PantauDesa</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {items.map((item) => {
          const isActive = item.path === activePath;
          const icon = item.icon ?? NAV_ICONS[item.label];

          return (
            <div
              key={item.path || item.label}
              onClick={() => handleItemClick(item.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleItemClick(item.path);
                }
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: isActive ? sidebarAccent : 'transparent',
                color: isActive ? sidebarTextHover : sidebarText,
                marginBottom: 4,
                transition: 'background-color 150ms ease, color 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = sidebarDivider;
                  e.currentTarget.style.color = sidebarTextHover;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = sidebarText;
                }
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {icon && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      opacity: isActive ? 1 : 0.8,
                    }}
                  >
                    {icon}
                  </span>
                )}
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  style={{
                    backgroundColor: '#C0392B',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 999,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div
        style={{
          padding: '12px 8px',
          borderTop: `1px solid ${sidebarDivider}`,
        }}
      >
        <div
          onClick={onHelp}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onHelp) {
              onHelp();
            }
          }}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            cursor: onHelp ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: sidebarTextMuted,
            fontSize: 14,
            marginBottom: 4,
            transition: 'background-color 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => {
            if (onHelp) {
              e.currentTarget.style.backgroundColor = sidebarDivider;
              e.currentTarget.style.color = sidebarText;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = sidebarTextMuted;
          }}
        >
          <HelpIcon />
          Help & Support
        </div>

        <div
          onClick={onLogout}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onLogout) {
              onLogout();
            }
          }}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            cursor: onLogout ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: sidebarTextMuted,
            fontSize: 14,
            transition: 'background-color 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => {
            if (onLogout) {
              e.currentTarget.style.backgroundColor = sidebarDivider;
              e.currentTarget.style.color = sidebarText;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = sidebarTextMuted;
          }}
        >
          <LogoutIcon />
          Logout
        </div>
      </div>
    </aside>
  );
}
