import { CategorySelector } from "../components/RecordSelectors";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type {
  AdminDashboard,
  Cases,
  AdminUsers,
  Petugas,
  SlaRulesResponse,
} from "../types";
import { colors, extendedColors } from "../theme/tokens";
import { logger } from "@/lib/logger";
import { SigapCard } from "../components/design-system/Card";
import { ErrorRetry } from "../components/design-system/ErrorRetry";
import { Skeleton } from "../components/design-system/Skeleton";
import { EmptyState } from "../components/design-system/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { toast } from "../components/Toast";

type AdminTab = "ringkasan" | "kasus" | "petugas" | "sla";

export const RegionalDashboard = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("ringkasan");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold" style={{ color: colors.textPrimary }}>
          Admin Daerah
        </h2>
        <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
          Gunakan ringkasan ini untuk melihat beban laporan, ketersediaan
          petugas, dan laporan yang mendekati atau melewati batas layanan. Buka
          daftar terkait sebelum membagi tugas atau mengubah aturan penanganan.
        </p>
      </div>

      <div
        className="flex gap-1 border-b"
        style={{ borderColor: colors.borderCard }}
      >
        {[
          { id: "ringkasan" as AdminTab, label: "Ringkasan" },
          { id: "kasus" as AdminTab, label: "Kasus" },
          { id: "petugas" as AdminTab, label: "Admin & Petugas" },
          { id: "sla" as AdminTab, label: "Aturan SLA" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="text-xs font-semibold pb-3 px-5 border-b-2 transition-colors"
            style={{
              color:
                activeTab === tab.id ? colors.primary : colors.textTertiary,
              borderColor:
                activeTab === tab.id ? colors.primary : "transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "ringkasan" && <RingkasanTab />}
      {activeTab === "kasus" && <KasusTab />}
      {activeTab === "petugas" && <PetugasTab />}
      {activeTab === "sla" && <SlaTab />}
    </div>
  );
};

function RingkasanTab() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .regionalDashboard()
      .then(setData)
      .catch((e) => {
        logger.error("Failed to fetch admin daerah dashboard", { error: e });
        setError("Gagal memuat dashboard");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton loading height={300} />;
  if (error)
    return (
      <ErrorRetry
        error={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
          api
            .regionalDashboard()
            .then(setData)
            .catch((e) => setError("Gagal memuat"))
            .finally(() => setLoading(false));
        }}
      />
    );
  if (!data)
    return (
      <EmptyState
        icon={<span style={{ fontSize: 48 }}>📊</span>}
        title="Tidak ada data"
      />
    );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SigapCard severity="primary" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Total Kasus
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            {data.total}
          </p>
        </SigapCard>
        <SigapCard severity="info" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Admin Aktif
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.info }}>
            {data.active_admins}
          </p>
        </SigapCard>
        <SigapCard severity="success" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Petugas Aktif
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.selesai }}>
            {data.active_petugas}
          </p>
        </SigapCard>
        <SigapCard severity="danger" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Melewati batas layanan
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.danger }}>
            {data.sla_breached}
          </p>
        </SigapCard>
        <SigapCard severity="warning" padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Mendekati batas layanan
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.warning }}>
            {data.sla_at_risk}
          </p>
        </SigapCard>
        <SigapCard padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Rata-rata Verifikasi
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            {data.avg_verification_days != null
              ? `${data.avg_verification_days.toFixed(1)}h`
              : "-"}
          </p>
        </SigapCard>
        <SigapCard padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Laporan terbaru
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: colors.textPrimary }}
          >
            {data.recent_submissions}
          </p>
        </SigapCard>
        <SigapCard padding={16}>
          <p className="text-xs mb-1" style={{ color: colors.textTertiary }}>
            Selesai Bulan Ini
          </p>
          <p className="text-2xl font-bold" style={{ color: colors.selesai }}>
            {data.resolved_this_month}
          </p>
        </SigapCard>
      </div>

      {data.by_category.length > 0 && (
        <SigapCard padding={16}>
          <h3
            className="text-sm font-bold mb-3"
            style={{ color: colors.textPrimary }}
          >
            Distribusi Kategori
          </h3>
          <div className="space-y-2">
            {data.by_category.map((cat) => {
              const pct =
                data.total > 0 ? Math.round((cat.count / data.total) * 100) : 0;
              return (
                <div key={cat.id} className="flex items-center gap-3">
                  <span
                    className="w-32 text-xs truncate"
                    style={{ color: colors.textSecondary }}
                  >
                    {cat.name}
                  </span>
                  <div
                    className="flex-1 h-2.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: extendedColors.bgSoft }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: colors.primary,
                      }}
                    />
                  </div>
                  <span
                    className="text-xs font-semibold w-16 text-right"
                    style={{ color: colors.textTertiary }}
                  >
                    {cat.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </SigapCard>
      )}
    </>
  );
}

function KasusTab() {
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>(
    {},
  );
  useEffect(() => {
    let active = true;
    api
      .categories()
      .then((result) => {
        if (active)
          setCategoryNames(
            Object.fromEntries(
              result.data.map((category) => [category.id, category.name]),
            ),
          );
      })
      .catch((error) => logger.warn("Gagal memuat nama kategori", { error }));
    return () => {
      active = false;
    };
  }, []);
  const [data, setData] = useState<Cases | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .regionalCases()
      .then(setData)
      .catch((e) => {
        logger.error("Failed to fetch admin daerah cases", { error: e });
        setError("Gagal memuat kasus");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton loading height={300} />;
  if (error)
    return (
      <ErrorRetry
        error={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
          api
            .regionalCases()
            .then(setData)
            .catch((e) => setError("Gagal memuat"))
            .finally(() => setLoading(false));
        }}
      />
    );
  if (!data || data.items.length === 0)
    return (
      <EmptyState
        icon={<span style={{ fontSize: 48 }}>📋</span>}
        title="Tidak ada kasus"
        subtitle="Belum ada kasus di wilayah daerah."
      />
    );

  return (
    <SigapCard padding={0}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr
              className="border-b"
              style={{
                backgroundColor: extendedColors.bgScreen,
                borderColor: colors.borderCard,
              }}
            >
              <th
                className="text-left px-4 py-3 text-xs font-semibold"
                style={{ color: colors.textTertiary }}
              >
                ID
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold"
                style={{ color: colors.textTertiary }}
              >
                Status
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold"
                style={{ color: colors.textTertiary }}
              >
                Kategori
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold"
                style={{ color: colors.textTertiary }}
              >
                Dibuat
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr
                key={c.id}
                className="border-b last:border-0 hover:bg-sigap-background/50 transition-colors"
                style={{ borderColor: colors.borderCard }}
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/system/cases/${c.id}`}
                    className="font-mono text-xs hover:underline"
                    style={{ color: colors.primary }}
                  >
                    {c.id.slice(0, 8)}...
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td
                  className="px-4 py-3 text-xs"
                  style={{ color: colors.textSecondary }}
                >
                  {categoryNames[c.category_id] || "Periksa kategori laporan"}
                </td>
                <td
                  className="px-4 py-3 text-xs"
                  style={{ color: colors.textTertiary }}
                >
                  {new Date(c.created_at).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SigapCard>
  );
}

function PetugasTab() {
  const [operators, setOperators] = useState<AdminUsers | null>(null);
  const [petugas, setPetugas] = useState<Petugas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.regionalOperators(), api.regionalPetugas()])
      .then(([ops, pets]) => {
        setOperators(ops);
        setPetugas(pets);
      })
      .catch((e) => {
        logger.error("Failed to fetch admin/petugas", { error: e });
        setError("Gagal memuat data personel");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton loading height={300} />;
  if (error)
    return (
      <ErrorRetry
        error={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
          Promise.all([api.regionalOperators(), api.regionalPetugas()])
            .then(([ops, pets]) => {
              setOperators(ops);
              setPetugas(pets);
            })
            .catch((e) => setError("Gagal memuat"))
            .finally(() => setLoading(false));
        }}
      />
    );

  return (
    <div className="space-y-6">
      <SigapCard padding={0}>
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: colors.borderCard }}
        >
          <h3
            className="text-sm font-bold"
            style={{ color: colors.textPrimary }}
          >
            Admin
          </h3>
        </div>
        {!operators || operators.items.length === 0 ? (
          <div
            className="p-6 text-center text-xs"
            style={{ color: colors.textMuted }}
          >
            Tidak ada admin
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    backgroundColor: extendedColors.bgScreen,
                    borderColor: colors.borderCard,
                  }}
                >
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Nama
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Email
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Role
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Dibuat
                  </th>
                </tr>
              </thead>
              <tbody>
                {operators.items.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b last:border-0"
                    style={{ borderColor: colors.borderCard }}
                  >
                    <td
                      className="px-4 py-3 font-medium"
                      style={{ color: colors.textPrimary }}
                    >
                      {u.name}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      {u.email}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textSecondary }}
                    >
                      {u.role}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      {new Date(u.created_at).toLocaleDateString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SigapCard>

      <SigapCard padding={0}>
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: colors.borderCard }}
        >
          <h3
            className="text-sm font-bold"
            style={{ color: colors.textPrimary }}
          >
            Petugas
          </h3>
        </div>
        {!petugas || petugas.items.length === 0 ? (
          <div
            className="p-6 text-center text-xs"
            style={{ color: colors.textMuted }}
          >
            Tidak ada petugas
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    backgroundColor: extendedColors.bgScreen,
                    borderColor: colors.borderCard,
                  }}
                >
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Nama
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Email
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Dibuat
                  </th>
                </tr>
              </thead>
              <tbody>
                {petugas.items.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b last:border-0"
                    style={{ borderColor: colors.borderCard }}
                  >
                    <td
                      className="px-4 py-3 font-medium"
                      style={{ color: colors.textPrimary }}
                    >
                      {u.name}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={
                          u.disabled
                            ? {
                                backgroundColor: extendedColors.bgSoft,
                                color: colors.textMuted,
                              }
                            : {
                                backgroundColor: colors.successBg,
                                color: colors.success,
                              }
                        }
                      >
                        {u.disabled ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textTertiary }}
                    >
                      {new Date(u.created_at).toLocaleDateString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SigapCard>
    </div>
  );
}

function SlaTab() {
  const [data, setData] = useState<SlaRulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    kategori_id: "",
    prioritas: "sedang" as "rendah" | "sedang" | "tinggi" | "kritis",
    jam: 24,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchSla = () => {
    setLoading(true);
    api
      .regionalSla()
      .then(setData)
      .catch((e) => {
        logger.error("Failed to fetch SLA rules", { error: e });
        setError("Gagal memuat aturan SLA");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSla();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.kategori_id.trim() || form.jam <= 0) return;
    setSubmitting(true);
    try {
      await api.createSlaRule({
        kategori_id: form.kategori_id.trim(),
        prioritas: form.prioritas,
        jam: form.jam,
      });
      toast.success("Aturan SLA berhasil ditambahkan");
      setShowForm(false);
      setForm({ kategori_id: "", prioritas: "sedang", jam: 24 });
      fetchSla();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menambahkan aturan SLA",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton loading height={300} />;
  if (error) return <ErrorRetry error={error} onRetry={fetchSla} />;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: colors.textTertiary }}>
          {data?.items?.length ?? 0} aturan SLA
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-4 py-2 rounded font-semibold transition-colors"
          style={{ backgroundColor: colors.primary, color: "#fff" }}
        >
          {showForm ? "Tutup Form" : "Tambah Aturan"}
        </button>
      </div>

      {showForm && (
        <SigapCard padding={16}>
          <h3
            className="text-sm font-bold mb-3"
            style={{ color: colors.textPrimary }}
          >
            Aturan SLA Baru
          </h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: colors.textTertiary }}
              >
                Kategori *
              </label>
              <CategorySelector
                value={form.kategori_id}
                onChange={(value) =>
                  setForm((current) => ({ ...current, kategori_id: value }))
                }
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: colors.textTertiary }}
              >
                Prioritas *
              </label>
              <select
                value={form.prioritas}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    prioritas: e.target.value as typeof form.prioritas,
                  }))
                }
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: colors.borderCard }}
              >
                <option value="rendah">Rendah</option>
                <option value="sedang">Sedang</option>
                <option value="tinggi">Tinggi</option>
                <option value="kritis">Kritis</option>
              </select>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: colors.textTertiary }}
              >
                Batas Waktu (jam) *
              </label>
              <input
                type="number"
                min={1}
                value={form.jam}
                onChange={(e) =>
                  setForm((f) => ({ ...f, jam: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: colors.borderCard }}
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !form.kategori_id.trim() || form.jam <= 0}
              className="px-4 py-2 rounded text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: colors.primary }}
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </form>
        </SigapCard>
      )}

      {!data || data.items.length === 0 ? (
        <EmptyState
          icon={<span style={{ fontSize: 48 }}>⏱️</span>}
          title="Tidak ada aturan SLA"
          subtitle="Buat aturan SLA pertama untuk mengatur batas waktu penanganan kasus."
        />
      ) : (
        <SigapCard padding={0}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    backgroundColor: extendedColors.bgScreen,
                    borderColor: colors.borderCard,
                  }}
                >
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Kategori
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Prioritas
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Batas Waktu
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: colors.textTertiary }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-0"
                    style={{ borderColor: colors.borderCard }}
                  >
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textSecondary }}
                    >
                      {r.kategori_nama ?? r.kategori_id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded capitalize"
                        style={{
                          backgroundColor:
                            r.prioritas === "kritis"
                              ? colors.dangerBg
                              : r.prioritas === "tinggi"
                                ? colors.warningBg
                                : r.prioritas === "sedang"
                                  ? colors.infoBg
                                  : extendedColors.bgSoft,
                          color:
                            r.prioritas === "kritis"
                              ? colors.danger
                              : r.prioritas === "tinggi"
                                ? colors.warning
                                : r.prioritas === "sedang"
                                  ? colors.info
                                  : colors.textSecondary,
                        }}
                      >
                        {r.prioritas}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: colors.textPrimary }}
                    >
                      {r.jam} jam
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={
                          r.is_active
                            ? {
                                backgroundColor: colors.successBg,
                                color: colors.success,
                              }
                            : {
                                backgroundColor: extendedColors.bgSoft,
                                color: colors.textMuted,
                              }
                        }
                      >
                        {r.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SigapCard>
      )}
    </>
  );
}
