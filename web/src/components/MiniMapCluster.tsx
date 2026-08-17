import { useEffect, useState, useMemo } from "react";
import { api } from "../api/client";
import type { FacilityCluster } from "../types";
import { logger } from "@/lib/logger";
import { colors } from "../theme/tokens";

interface MiniMapClusterProps {
  className?: string;
  bbox?: string;
  zoom?: number;
  month?: string;
}

interface NormalizedCluster extends FacilityCluster {
  x: number;
  y: number;
  size: number;
}

function getPinSize(count: number, maxCount: number): number {
  const minSize = 20;
  const maxSize = 36;
  if (maxCount <= 0) return minSize;
  const ratio = Math.min(count / maxCount, 1);
  return Math.round(minSize + ratio * (maxSize - minSize));
}

export function MiniMapCluster({ className = "", bbox, zoom = 10, month }: MiniMapClusterProps) {
  const [clusters, setClusters] = useState<FacilityCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .facilitiesCluster({ ...(bbox ? { bbox } : {}), zoom })
      .then(({ clusters }) => {
        if (!cancelled) {
          setClusters(clusters);
          setLoading(false);
        }
      })
      .catch((err) => {
        logger.error("Failed to fetch public reports cluster", { error: err });
        if (!cancelled) {
          setError("Gagal memuat cluster");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bbox, zoom]);

  const normalizedClusters = useMemo<NormalizedCluster[]>(() => {
    if (clusters.length === 0) return [];

    const lngs = clusters.map((c) => c.lng);
    const lats = clusters.map((c) => c.lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const lngRange = maxLng - minLng || 0.1;
    const latRange = maxLat - minLat || 0.1;

    const maxCount = Math.max(...clusters.map((c) => c.count), 1);

    return clusters.map((cluster) => {
      const x = 10 + ((cluster.lng - minLng) / lngRange) * 80;
      const y = 10 + ((cluster.lat - minLat) / latRange) * 80;

      return {
        ...cluster,
        x,
        y,
        size: getPinSize(cluster.count, maxCount),
      };
    });
  }, [clusters]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.background,
        borderRadius: 13,
      }}
    >
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `
            linear-gradient(${colors.border} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.border} 1px, transparent 1px)
          `,
          backgroundSize: "34px 34px",
        }}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-sigap-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-sigap-textMuted">{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="relative w-full h-full">
          {normalizedClusters.map((cluster, index) => (
            <div
              key={index}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${cluster.x}%`,
                top: `${cluster.y}%`,
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeftWidth: 5,
                  borderRightWidth: 5,
                  borderTopWidth: 7,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderTopColor: cluster.color,
                  margin: "0 auto",
                }}
              />
              <div
                style={{
                  width: cluster.size,
                  height: cluster.size,
                  backgroundColor: cluster.color,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  fontSize: cluster.count >= 10 ? 10 : 11,
                  fontWeight: 700,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                  border: "2px solid white",
                }}
              >
                {cluster.count}
              </div>
            </div>
          ))}

          {normalizedClusters.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-sigap-textMuted">Tidak ada data cluster</span>
            </div>
          )}
        </div>
      )}

      <div
        className="absolute bottom-2 left-1/2 transform -translate-x-1/2"
        style={{
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: "4px 12px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: colors.textTertiary,
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        }}
      >
        Peta Persebaran Kasus
      </div>
    </div>
  );
}
