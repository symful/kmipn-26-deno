import React from 'react';
import { Outlet } from 'react-router-dom';

const navItems = [
  { label: 'Ringkasan', path: '/ringkasan', badge: 14 },
  { label: 'Peta & Kasus', path: '/peta' },
  { label: 'Verifikasi', path: '/verifikasi' },
  { label: 'Tugas', path: '/tugas' },
  { label: 'Statistik', path: '/statistik' },
  { label: 'Export', path: '/export' },
];

export function AuthenticatedLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
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
          {navItems.map((item) => (
            <div
              key={item.path}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: item.path === '/ringkasan' ? '#0F7A6B' : 'transparent',
                color: item.path === '/ringkasan' ? 'white' : '#CFE4DF',
                marginBottom: 4,
              }}
            >
              <span>{item.label}</span>
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
        
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid #234A43',
        }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#9DC0B9',
          }}>
            Administrasi
          </div>
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#9DC0B9',
          }}>
            Audit Log
          </div>
        </div>
      </aside>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 58,
          borderBottom: '1px solid #E4E7E2',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          backgroundColor: 'white',
        }}>
          <input
            type="text"
            placeholder="Cari kasus, desa, atau ID…"
            style={{
              flex: 1,
              maxWidth: 400,
              padding: '8px 12px',
              border: '1px solid #E4E7E2',
              borderRadius: 8,
              fontSize: 14,
            }}
          />
          
          <div style={{
            marginLeft: 12,
            padding: '8px 12px',
            border: '1px solid #E4E7E2',
            borderRadius: 8,
            fontSize: 13,
            color: '#3A3F45',
          }}>
            Kec. Cisarua · Jul 2026
          </div>
          
          <div style={{ flex: 1 }} />
          
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: '#0F7A6B',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: 13,
          }}>
            BM
          </div>
        </header>
        
        <main style={{ flex: 1, padding: 24, backgroundColor: '#F9FAF8' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
