export const TEST_USERS = [
  { email: "admin@sigap.test", password: "admin123", role: "ADMIN" },
  { email: "verifikator@sigap.test", password: "verifikator123", role: "VERIFIKATOR" },
  { email: "surveyor@sigap.test", password: "surveyor123", role: "SURVEYOR" },
  { email: "rt_rw@sigap.test", password: "rt_rw123", role: "RT_RW" },
  { email: "operator@sigap.test", password: "operator123", role: "OPERATOR" },
  { email: "petugas@sigap.test", password: "petugas123", role: "PETUGAS" },
  { email: "admin_daerah@sigap.test", password: "admin_daerah123", role: "ADMIN_DAERAH" },
  { email: "auditor@sigap.test", password: "auditor123", role: "AUDITOR" },
  { email: "pengambil_keputusan@sigap.test", password: "pengambil_keputusan123", role: "PENGAMBIL_KEPUTUSAN" },
] as const;

export async function getTestUser(role: string) {
  const user = TEST_USERS.find(u => u.role === role);
  if (!user) throw new Error(`No test user for role: ${role}`);
  return user;
}
