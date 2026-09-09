import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PageHead } from "../components/ReferencePage";

type Tab = "kecamatan" | "pengguna";

interface KecamatanRow {
  kecamatan: string;
  score: number;
  activity_rate: number;
  participation_rate: number;
  quality_rate: number;
  activity_percentile: number;
  participation_percentile: number;
  accepted_contributions: number;
  unique_contributors: number;
  adjudicated_total: number;
  active_months: number;
  denominator_source: string;
}

interface UserRow {
  rank: number;
  name: string;
  xp: number;
  level: number;
  reputation: number | null;
  status_changing_accepted: number;
}

export const PublicLeaderboard = () => {
  const [tab, setTab] = useState<Tab>("kecamatan");
  const [kecamatan, setKecamatan] = useState<KecamatanRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (tab === "kecamatan") {
      api
        .publicGamificationKecamatan()
        .then((data) => {
          if (active) setKecamatan(data.leaderboard ?? []);
        })
        .catch((e: Error) => {
          if (active) setError(e.message || "Gagal memuat leaderboard");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      api
        .publicGamificationUsers()
        .then((data) => {
          if (active) setUsers(data.leaderboard ?? []);
        })
        .catch((e: Error) => {
          if (active) setError(e.message || "Gagal memuat leaderboard");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [tab]);

  const fmtPct = (v: number) =>
    v > 10 ? "> 1000%" : `${(v * 100).toFixed(1)}%`;
  const fmtScore = (v: number) => v.toFixed(1);

  let denomMonths: number | null = null;
  let denomSource = "";
  if (tab === "kecamatan" && kecamatan[0]) {
    denomMonths = kecamatan[0].active_months;
    denomSource = kecamatan[0].denominator_source;
  }

  return (
    <div className="ref-content">
      <PageHead
        title="Leaderboard"
        subtitle="Leaderboard sepanjang waktu, tidak di-reset; pengguna bersifat opt-in."
      />

      <div className="ref-detail-tabs">
        <button
          aria-selected={tab === "kecamatan"}
          onClick={() => setTab("kecamatan")}
        >
          Kecamatan
        </button>
        <button
          aria-selected={tab === "pengguna"}
          onClick={() => setTab("pengguna")}
        >
          Pengguna
        </button>
      </div>

      {error ? (
        <div className="ref-notice" role="alert">
          {error}{" "}
          <button
            className="ref-button"
            onClick={() => {
              setError("");
              setLoading(true);
              if (tab === "kecamatan") {
                api
                  .publicGamificationKecamatan()
                  .then((data) => setKecamatan(data.leaderboard ?? []))
                  .catch((e: Error) => setError(e.message || "Gagal memuat leaderboard"))
                  .finally(() => setLoading(false));
              } else {
                api
                  .publicGamificationUsers()
                  .then((data) => setUsers(data.leaderboard ?? []))
                  .catch((e: Error) => setError(e.message || "Gagal memuat leaderboard"))
                  .finally(() => setLoading(false));
              }
            }}
          >
            Coba lagi
          </button>
        </div>
      ) : loading ? (
        <p style={{ fontSize: 12, color: "#616770" }}>Memuat...</p>
      ) : tab === "kecamatan" ? (
        kecamatan.length === 0 ? (
          <div className="ref-empty">Belum ada data leaderboard</div>
        ) : (
          <>
            <section className="ref-card" style={{ marginTop: 0 }}>
              <div className="ref-table-wrap">
                <table className="ref-table">
                  <thead>
                    <tr>
                      <th>Peringkat</th>
                      <th>Kecamatan</th>
                      <th>Skor</th>
                      <th>Rate Aktivitas</th>
                      <th>Rate Partisipasi</th>
                      <th>Rate Kualitas</th>
                      <th>Kontributor</th>
                      <th>Kontribusi Accepted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kecamatan.map((row, i) => (
                      <tr key={row.kecamatan}>
                        <td>{i + 1}</td>
                        <td>{row.kecamatan}</td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: "#0f7a6b",
                          }}
                        >
                          {fmtScore(row.score)}
                        </td>
                        <td>{fmtPct(row.activity_rate)}</td>
                        <td>{fmtPct(row.participation_rate)}</td>
                        <td>{fmtPct(row.quality_rate)}</td>
                        <td>{row.unique_contributors}</td>
                        <td>{row.accepted_contributions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            {denomMonths !== null && (
              <p
                style={{
                  fontSize: 10,
                  color: "#616770",
                  marginTop: 10,
                }}
              >
                Dinormalisasi {denomMonths} bulan aktif; denominator:{" "}
                {denomSource}
              </p>
            )}
          </>
        )
      ) : users.length === 0 ? (
        <div className="ref-empty">Belum ada data leaderboard</div>
      ) : (
        <>
          <div className="ref-notice" style={{ marginBottom: 16 }}>
            Papan skor pengguna bersifat opt-in. Pengguna memerlukan minimal 5
            kontribusi yang telah diadjudikasi dan reputasi minimal 70% untuk
            muncul di papan skor ini.
          </div>
          <section className="ref-card" style={{ marginTop: 0 }}>
            <div className="ref-table-wrap">
              <table className="ref-table">
                <thead>
                  <tr>
                    <th>Peringkat</th>
                    <th>Nama</th>
                    <th>XP</th>
                    <th>Level</th>
                    <th>Reputasi</th>
                    <th>Pembaruan Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.rank}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.xp}</td>
                      <td>{row.level}</td>
                      <td>
                        {row.reputation !== null
                          ? fmtPct(row.reputation)
                          : "\u2014"}
                      </td>
                      <td>{row.status_changing_accepted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
