import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { colors, bgSoft } from "../../theme/tokens";
import { logger } from "@/lib/logger";

interface AuditorStats {
  counts: { total: number; last_24h: number; last_7d: number; last_30d: number };
  top_actors: Array<{ actor: string; action_count: number }>;
  failed_attempts: number;
  recent_suspicious: Array<{
    id: string;
    actor: string;
    action: string;
    object_type: string;
    object_id: string;
    created_at: string;
  }>;
}

interface ChainIntegrity {
  ok: boolean;
  count: number;
  first_break_at?: number;
}

export const AuditorDashboard = () => {
  const [stats, setStats] = useState<AuditorStats | null>(null);
  const [chainIntegrity, setChainIntegrity] = useState<ChainIntegrity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, chainData] = await Promise.all([
        api.auditorStats(),
        api.auditVerifyChain(),
      ]);
      setStats(statsData);
      setChainIntegrity(chainData);
    } catch (err) {
      logger.error("Failed to fetch auditor dashboard data", { error: err });
      setError("Gagal memuat data: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <p className="text-sigap-textMuted">Memuat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sigap-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-sigap-primary text-white rounded-lg"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sigap-background">
      <header className="bg-sigap-surface px-6 py-4 border-b border-sigap-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              A
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard Auditor</h1>
              <p className="text-xs text-sigap-textMuted">Audit &amp; Integrity Monitoring</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 text-sm font-medium text-sigap-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <p className="text-xs text-sigap-textMuted">Total Entries</p>
                <p className="text-2xl font-bold">{stats.counts.total.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <p className="text-xs text-sigap-textMuted">24 Jam</p>
                <p className="text-2xl font-bold">{stats.counts.last_24h.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <p className="text-xs text-sigap-textMuted">7 Hari</p>
                <p className="text-2xl font-bold">{stats.counts.last_7d.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <p className="text-xs text-sigap-textMuted">30 Hari</p>
                <p className="text-2xl font-bold">{stats.counts.last_30d.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <p className="text-xs text-sigap-textMuted">Failed (7d)</p>
                <p className="text-2xl font-bold text-sigap-perluTindakan">{stats.failed_attempts.toLocaleString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <h2 className="text-sm font-semibold mb-4">Chain Integrity</h2>
                {chainIntegrity && (
                  <div className="flex items-center gap-3">
                    {chainIntegrity.ok ? (
                      <>
                        <div className="w-10 h-10 rounded-full bg-sigap-selesai flex items-center justify-center">
                          <span className="text-sigap-selesai text-xl">✓</span>
                        </div>
                        <div>
                          <p className="font-semibold text-sigap-selesai">Integrity Verified</p>
                          <p className="text-xs text-sigap-textMuted">
                            {chainIntegrity.count.toLocaleString()} entries checked
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-sigap-perluTindakan flex items-center justify-center">
                          <span className="text-sigap-perluTindakan text-xl">✗</span>
                        </div>
                        <div>
                          <p className="font-semibold text-sigap-perluTindakan">Integrity Broken</p>
                          <p className="text-xs text-sigap-textMuted">
                            First break at entry {chainIntegrity.first_break_at}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg p-4 border border-sigap-border">
                <h2 className="text-sm font-semibold mb-4">Top Actors (30d)</h2>
                {stats.top_actors.length === 0 ? (
                  <p className="text-sigap-textMuted text-sm">No data available</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_actors.slice(0, 5).map((actor, idx) => (
                      <div key={actor.actor} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-sigap-surface flex items-center justify-center text-xs font-medium">
                            {idx + 1}
                          </span>
                          <span className="text-sm truncate max-w-[200px]">{actor.actor}</span>
                        </div>
                        <span className="text-sm font-semibold">{actor.action_count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-sigap-border">
              <h2 className="text-sm font-semibold mb-4">Recent Suspicious Actions</h2>
              {stats.recent_suspicious.length === 0 ? (
                <p className="text-sigap-textMuted text-sm text-center py-4">
                  No suspicious actions detected
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sigap-border">
                        <th className="text-left py-2 px-3 font-medium text-sigap-textMuted">Time</th>
                        <th className="text-left py-2 px-3 font-medium text-sigap-textMuted">Actor</th>
                        <th className="text-left py-2 px-3 font-medium text-sigap-textMuted">Action</th>
                        <th className="text-left py-2 px-3 font-medium text-sigap-textMuted">Object</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent_suspicious.map((entry) => (
                        <tr key={entry.id} className="border-b border-sigap-border last:border-0 hover:bg-sigap-surface">
                          <td className="py-2 px-3 text-sigap-textMuted">
                            {new Date(entry.created_at).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2 px-3 truncate max-w-[150px]">{entry.actor ?? "-"}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-1 bg-sigap-perluTindakan text-sigap-perluTindakan rounded text-xs font-medium">
                              {entry.action}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-sigap-textMuted truncate max-w-[150px]">
                            {entry.object_type}: {entry.object_id ?? "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
