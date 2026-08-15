import React from 'react';

interface NavItem {
  label: string;
  path?: string;
  badge?: number;
  icon?: React.ReactNode;
}

interface SidebarProps {
  items: NavItem[];
  activePath?: string;
  bottomItems?: NavItem[];
}

export function Sidebar({ items, activePath, bottomItems = [] }: SidebarProps) {
  return (
    <aside style={{
      width: 220,
      backgroundColor: '#16302B',
      color: '#CFE4DF',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid #234A43',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <span style={{ fontWeight: 600 }}>PantauDesa</span>
        </div>
      </div>
      
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {items.map((item) => (
          <div
            key={item.path || item.label}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: item.path === activePath ? '#0F7A6B' : 'transparent',
              color: item.path === activePath ? 'white' : '#CFE4DF',
              marginBottom: 4,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.icon}
              {item.label}
            </span>
            {item.badge && (
              <span style={{
                backgroundColor: '#C0392B',
                color: 'white',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 999,
              }}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </nav>
      
      {bottomItems.length > 0 && (
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid #234A43',
        }}>
          {bottomItems.map((item) => (
            <div
              key={item.path || item.label}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                color: '#9DC0B9',
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
