import { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import MarkerClusterGroup from "react-leaflet-cluster";
import { logger } from "../lib/logger";
import { colors } from "../theme/tokens";
import type { Report } from "../types";

export interface HeatmapConfig {
  radius?: number;
  blur?: number;
  maxZoom?: number;
  intensity?: number;
}

export interface MapViewProps {
  reports: Report[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  mode?: "markers" | "heatmap" | "both";
  heatmapConfig?: HeatmapConfig;
  renderPopup?: (report: Report) => ReactNode;
}

const TILE_URL = import.meta.env.VITE_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function FitBounds({ reports }: { reports: Report[] }) {
  const map = useMap();
  if (reports.length === 0) return null;
  const bounds = reports.map((r) => [r.lat, r.lng] as [number, number]);
  map.fitBounds(bounds, { padding: [50, 50] });
  return null;
}

// Indonesia boundaries: south=-11, west=95, north=6, east=141
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [-11.0, 95.0],  // southwest corner
  [6.0, 141.0],   // northeast corner
];

interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
}

interface ClusterMarker {
  getChildCount(): number;
  getAllChildMarkers(): L.Marker[];
  getBounds(): L.LatLngBounds;
}

const HEATMAP_GRADIENT = {
  0.0: colors.selesai,
  0.3: "#84cc16",
  0.5: "#eab308",
  0.7: "#f97316",
  1.0: colors.perluTindakan,
} as const;

function computeHeatmapPoints(reports: Report[]): HeatmapPoint[] {
  if (reports.length === 0) return [];
  const points: HeatmapPoint[] = reports.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    intensity: r.severity ?? 0.5,
  }));
  return points;
}

function HeatmapLayer({
  points,
  map,
  config,
}: {
  points: HeatmapPoint[];
  map: L.Map | null;
  config?: HeatmapConfig;
}) {
  const heatLayerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (heatLayerRef.current) {
      heatLayerRef.current.remove();
      heatLayerRef.current = null;
    }

    if (points.length === 0) return;

    const heatData: [number, number, number][] = points.map((p) => [
      p.lat,
      p.lng,
      p.intensity,
    ]);

    heatLayerRef.current = L.heatLayer(heatData, {
      radius: config?.radius ?? 25,
      blur: config?.blur ?? 15,
      maxZoom: config?.maxZoom ?? 18,
      gradient: HEATMAP_GRADIENT,
    });

    heatLayerRef.current.addTo(map);

    return () => {
      if (heatLayerRef.current) {
        heatLayerRef.current.remove();
        heatLayerRef.current = null;
      }
    };
  }, [map, points, config]);

  return null;
}

function Legend({ showHeatmap }: { showHeatmap: boolean }) {
  return (
    <div className="leaflet-bottom leaflet-left p-2">
      <div className="bg-sigap-surface border border-sigap-border rounded p-2 text-xs">
        <p className="font-medium mb-1">Legenda</p>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-sigap-primary" />
          <span>Markers</span>
        </div>
        {showHeatmap && (
          <>
            <div className="flex items-center gap-1 mt-1">
              <span>Heatmap:</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div
                className="h-2 w-12 rounded"
                style={{
                  background:
                    `linear-gradient(to right, ${HEATMAP_GRADIENT[0.0]}, ${HEATMAP_GRADIENT[0.3]}, ${HEATMAP_GRADIENT[0.5]}, ${HEATMAP_GRADIENT[0.7]}, ${HEATMAP_GRADIENT[1.0]})`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] mt-0.5">
              <span>Rendah</span>
              <span>Tinggi</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1 mt-1">
          <div className="w-3 h-3 rounded-full bg-sigap-diproses opacity-80" />
          <span>Cluster</span>
        </div>
      </div>
    </div>
  );
}

function MapController({
  reports,
  showHeatmap,
  heatmapConfig,
}: {
  reports: Report[];
  showHeatmap: boolean;
  heatmapConfig?: HeatmapConfig;
}) {
  const map = useMap();
  const heatmapPoints = computeHeatmapPoints(reports);

  return <HeatmapLayer points={showHeatmap ? heatmapPoints : []} map={map} config={heatmapConfig!} />;
}

function CountryBoundaries() {
  const map = useMap();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const worldUrl = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

    fetch(worldUrl)
      .then((res) => res.json())
      .then((data) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.remove();
        }
        geoJsonRef.current = L.geoJSON(data, {
          style: (feature) => {
            const isIndonesia = feature?.properties?.name === "Indonesia";
            if (isIndonesia) {
              return { opacity: 0, fillOpacity: 0 };
            }
            return {
              color: colors.border,
              weight: 1,
              opacity: 0.5,
              fillColor: colors.background,
              fillOpacity: 0.7,
            };
          },
        }).addTo(map);
      })
      .catch((err) => {
        logger.warn("Failed to load world GeoJSON:", { error: err });
      });

    return () => {
      if (geoJsonRef.current) {
        geoJsonRef.current.remove();
      }
    };
  }, [map]);

  return null;
}

export const MapView = ({
  reports,
  center = [-2.5, 118.0],
  zoom = 5,
  height = "600px",
  mode = "markers",
  heatmapConfig,
  renderPopup,
}: MapViewProps) => {
  const [tileError, setTileError] = useState(false);
  const showMarkers = mode === "markers" || mode === "both";
  const showHeatmap = mode === "heatmap" || mode === "both";

  const handleTileError = () => {
    setTileError(true);
  };

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: "100%" }}
      maxBounds={INDONESIA_BOUNDS}
      maxBoundsViscosity={1.0}
      minZoom={4}
      maxZoom={18}
      worldCopyJump={true}
    >
      <TileLayer
        url={tileError ? FALLBACK_TILE_URL : TILE_URL}
        attribution={tileError
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
        eventHandlers={{
          tileerror: handleTileError,
        }}
      />
      <MapController reports={reports} showHeatmap={showHeatmap} heatmapConfig={heatmapConfig!} />
      <CountryBoundaries />
      {showMarkers && (
        <MarkerClusterGroup
          chunkedLoading
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          maxClusterRadius={50}
          disableClusteringAtZoom={16}
          iconCreateFunction={(cluster: ClusterMarker) => {
            const count = cluster.getChildCount();
            let size: "small" | "medium" | "large" = "small";
            if (count >= 100) size = "large";
            else if (count >= 10) size = "medium";

            const sizes: Record<"small" | "medium" | "large", string> = {
              small: "w-6 h-6",
              medium: "w-8 h-8",
              large: "w-10 h-10",
            };

            const fontSizes: Record<"small" | "medium" | "large", string> = {
              small: "text-[10px]",
              medium: "text-xs",
              large: "text-sm",
            };

            return L.divIcon({
              html: `<div class="cluster-icon ${sizes[size]} bg-sigap-diproses text-white rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white ${fontSizes[size]}">${count}</div>`,
              className: "",
              iconSize: L.point(0, 0),
            });
          }}
        >
          {reports.map((r) => (
            <Marker key={r.id} position={[r.lat, r.lng]}>
              <Popup>
                {renderPopup ? renderPopup(r) : (
                  <>
                    <strong>{r.category?.name ?? r.category_id}</strong>
                    <br />
                    Status: {r.status}
                  </>
                )}
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}
      <FitBounds reports={reports} />
      <Legend showHeatmap={showHeatmap} />
    </MapContainer>
  );
};
