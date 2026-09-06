-- seed.sql — Seed reference data for SIGAP D1
-- Usage: npx wrangler d1 execute kmipn-26-deno --remote --file=scripts/seed.sql

-- Users (3 demo accounts)
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES
  ('usr-admin-1', 'admin@sigap.live', '$2a$10$hq/r0Dk8h5GPmOA4YC0n5.aoihYz4Dn4pVnuHYzdifUXA8Fmo9132', 'Admin Sigap', 'ADMIN', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES
  ('usr-petugas-1', 'petugas@sigap.live', '$2a$10$bl4uffTLUR6CeFB11GTOkuqskbZLmZ7WunSMqjIANHFpz4T76a3EK', 'Agus Petugas Lapangan', 'PETUGAS', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES
  ('usr-warga-1', 'warga@sigap.live', '$2a$10$iKzXKeNzfOo2Pj5LwwC/MOrm/qNVJuoZ7U8yv5DofIlcjDdLen7Ha', 'Budi Santoso (Warga)', 'WARGA', datetime('now'), datetime('now'));

-- Categories
INSERT OR IGNORE INTO categories (id, slug, name, icon, created_at) VALUES
  (lower(hex(randomblob(6))), 'jalan_rusak', 'Jalan', 'road', datetime('now')),
  (lower(hex(randomblob(6))), 'jembatan_rusak', 'Jembatan', 'bridge', datetime('now')),
  (lower(hex(randomblob(6))), 'air_bersih', 'Air Bersih', 'droplet', datetime('now')),
  (lower(hex(randomblob(6))), 'fasilitas_umum', 'Fasilitas Umum', 'building', datetime('now')),
  (lower(hex(randomblob(6))), 'irigasi', 'Irigasi', 'drainage', datetime('now'));

-- Units
INSERT OR IGNORE INTO units (id, nama, alamat, kontak, is_active, created_by, created_at, updated_at) VALUES
  ('unit-1', 'Unit Tanggap Darurat Bandung', 'Jl. Raya Cisarua No.1', '081234567890', 1, 'usr-admin-1', datetime('now'), datetime('now'));

-- Priority formula (v1 active)
INSERT OR IGNORE INTO priority_formula_versions (id, version, weights, is_active, activated_at, activated_by, created_at) VALUES
  ('pfv-1', 1, '{"severity": 0.4, "impact": 0.25, "report_count": 0.2, "sla": 0.15}', 1, datetime('now'), 'usr-admin-1', datetime('now'));

-- SLA rules (per category x priority)
INSERT OR IGNORE INTO sla_rules (id, kategori_id, prioritas, jam, is_active, created_by, created_at, updated_at) VALUES
  ('sla-jalan-rendah', (SELECT id FROM categories WHERE slug='jalan_rusak'), 'rendah', 168, 1, 'usr-admin-1', datetime('now'), datetime('now')),
  ('sla-jalan-sedang', (SELECT id FROM categories WHERE slug='jalan_rusak'), 'sedang', 72, 1, 'usr-admin-1', datetime('now'), datetime('now')),
  ('sla-jalan-tinggi', (SELECT id FROM categories WHERE slug='jalan_rusak'), 'tinggi', 24, 1, 'usr-admin-1', datetime('now'), datetime('now')),
  ('sla-jalan-kritis', (SELECT id FROM categories WHERE slug='jalan_rusak'), 'kritis', 6, 1, 'usr-admin-1', datetime('now'), datetime('now'));

-- Checklist templates (one per category)
INSERT OR IGNORE INTO checklist_templates(id,category_id,version,items,created_by)
SELECT 'checklist-' || id,id,1,'[{"item":"Foto kondisi dari 3 sudut","required":true},{"item":"Ukur perkiraan dimensi","required":true},{"item":"Tandai koordinat presisi","required":true}]','usr-admin-1' FROM categories;
