import React from 'react';
import {
  colors,
  sidebarBg,
  sidebarText,
  sidebarTextHover,
  sidebarAccent,
  sidebarDivider,
} from '../../theme/tokens';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  badgeCount?: number | undefined;
  isActive?: boolean;
  onClick?: (() => void) | undefined;
}

export function NavItem({
  icon,
  label,
  badgeCount,
  isActive = false,
  onClick,
}: NavItemProps) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: isActive ? colors.primary : 'transparent',
        color: isActive ? '#ffffff' : sidebarText,
        marginBottom: 4,
        transition: 'background-color 150ms ease, color 150ms ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive && onClick) {
          e.currentTarget.style.backgroundColor = sidebarAccent;
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          style={{
            backgroundColor: colors.perluTindakan,
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 999,
            minWidth: 20,
            textAlign: 'center',
          }}
        >
          {badgeCount}
        </span>
      )}
    </div>
  );
}

interface SidebarNavProps {
  items: NavItemProps[];
  activePath?: string;
  bottomItems?: NavItemProps[];
}

export function SidebarNav({
  items,
  activePath,
  bottomItems = [],
}: SidebarNavProps) {
  return (
    <aside
      style={{
        width: 220,
        backgroundColor: sidebarBg,
        color: sidebarText,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
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
            }}
          >
            P
          </div>
          <span style={{ fontWeight: 600 }}>PantauDesa</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {items.map((item) => (
          <NavItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            badgeCount={item.badgeCount}
            isActive={item.isActive ?? item.label === activePath}
            onClick={item.onClick}
          />
        ))}
      </nav>

      {bottomItems.length > 0 && (
        <div
          style={{
            padding: '12px 8px',
            borderTop: `1px solid ${sidebarDivider}`,
          }}
        >
          {bottomItems.map((item) => (
            <NavItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              badgeCount={item.badgeCount}
              isActive={item.isActive ?? item.label === activePath}
              onClick={item.onClick}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
