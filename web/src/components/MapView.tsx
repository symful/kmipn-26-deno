import { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  useMap,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import MarkerClusterGroup from "react-leaflet-cluster";
import { logger } from "../lib/logger";
import { api } from "../api/client";
import { colors, heatmapGradient } from "../theme/tokens";
import type { Facility, Report } from "../types";
import { MapDrawer } from "./MapDrawer";

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
  onSelectReport?: (report: Report | null) => void;
  showDrawer?: boolean;
  layer?: "standard" | "satellite" | "no_labels" | "facilities";
  cluster?: boolean;
  publicMap?: boolean;
}

const TILE_URL =
  import.meta.env.VITE_TILE_URL ||
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const FALLBACK_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Indonesia boundaries & center
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [-11.0, 95.0], // southwest
  [6.0, 141.0], // northeast
];

const INDONESIA_CENTER: [number, number] = [-2.548926, 118.0148634];
const INDONESIA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-14.0, 92.0],
  [9.0, 144.0],
];

function AutoFitController({
  reports,
  center,
  zoom,
}: {
  reports: Report[];
  center?: [number, number];
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    const validReports = (reports ?? []).filter(
      (r) =>
        typeof r.lat === "number" &&
        typeof r.lng === "number" &&
        !isNaN(r.lat) &&
        !isNaN(r.lng) &&
        (r.lat !== 0 || r.lng !== 0),
    );

    if ((validReports?.length ?? 0) > 0) {
      if ((validReports?.length ?? 0) === 1) {
        const r = validReports[0];
        if (r) {
          map.setView([r.lat, r.lng], Math.max(map.getZoom(), 13), {
            animate: true,
          });
        }
      } else {
        const bounds = validReports.map(
          (r) => [r.lat, r.lng] as [number, number],
        );
        map.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 14,
          animate: true,
        });
      }
    } else if (center && zoom) {
      map.setView(center, zoom, { animate: true });
    } else {
      map.fitBounds(INDONESIA_BOUNDS, { padding: [20, 20], animate: true });
    }

    return () => clearTimeout(timer);
  }, [map, reports, center, zoom]);

  return null;
}

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
  0.3: heatmapGradient.lime,
  0.5: heatmapGradient.yellow,
  0.7: heatmapGradient.orange,
  1.0: colors.perluTindakan,
} as const;

// --- Cluster halo helpers (P-02) ---

/** Map a report status to the cluster legend color. */
function clusterStatusColor(status: string): string {
  // Blue — Terverifikasi
  if (
    status === "verified" ||
    status === "diterima" ||
    status === "terverifikasi"
  )
    return colors.diproses;
  // Amber — Menunggu verifikasi
  if (
    status === "under_review" ||
    status === "needs_verification" ||
    status === "needs_survey" ||
    status === "menunggu"
  )
    return colors.warning;
  // Teal — Sedang ditangani / Selesai
  if (
    status === "in_progress" ||
    status === "sedang_ditangani" ||
    status === "dalam_proses" ||
    status === "resolved" ||
    status === "selesai"
  )
    return colors.primary;
  return colors.diproses;
}

/** Determine the dominant report status inside a cluster via bounds check. */
function dominantClusterStatus(
  cluster: ClusterMarker,
  reports: Report[],
): string {
  const bounds = cluster.getBounds();
  const counts: Record<string, number> = {};
  for (const r of reports) {
    if (bounds.contains(L.latLng(r.lat, r.lng))) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
  }
  let best = "submitted";
  let max = 0;
  for (const [s, c] of Object.entries(counts)) {
    if (c > max) {
      max = c;
      best = s;
    }
  }
  return best;
}

/** Build cluster divIcon HTML: semi-transparent halo ring behind solid marker circle. */
function clusterIconHtml(
  count: number,
  color: string,
  size: "small" | "medium" | "large",
): string {
  const halo = { small: 36, medium: 44, large: 52 }[size];
  const dot = { small: 24, medium: 32, large: 40 }[size];
  const fs = { small: "10px", medium: "12px", large: "14px" }[size];
  return (
    `<div style="position:relative;width:${halo}px;height:${halo}px;display:flex;align-items:center;justify-content:center;">` +
    `<div style="position:absolute;inset:0;border-radius:9999px;background-color:${color};opacity:0.18;"></div>` +
    `<div style="position:relative;width:${dot}px;height:${dot}px;border-radius:9999px;background-color:${color};border:2px solid white;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:${fs};">${count}</div>` +
    `</div>`
  );
}

export function computeHeatmapPoints(reports: Report[]): HeatmapPoint[] {
  if ((reports?.length ?? 0) === 0) return [];
  const points: HeatmapPoint[] = reports
    .filter(
      (r) =>
        r.severity != null &&
        Number.isFinite(r.severity) &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng),
    )
    .map((r) => ({
      lat: r.lat,
      lng: r.lng,
      intensity: r.severity!,
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

    if ((points?.length ?? 0) === 0) return;

    const heatData: [number, number, number][] = (points ?? []).map((p) => [
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
    <div className="ref-map-legend">
      <b>Status kasus</b>
      <span>
        <i style={{ background: "#0f7a6b" }} />
        Terverifikasi / selesai
      </span>
      <span>
        <i style={{ background: "#b8730a" }} />
        Menunggu tindak lanjut
      </span>
      <span>
        <i style={{ background: "#2563eb" }} />
        Sedang ditangani
      </span>
      {showHeatmap && (
        <div style={{ maxWidth: 260, marginTop: 8, lineHeight: 1.5 }}>
          <b>Sebaran laporan kerusakan</b>
          <div
            aria-hidden="true"
            style={{
              height: 8,
              borderRadius: 4,
              margin: "8px 0 6px",
              background: `linear-gradient(to right, ${Object.entries(
                HEATMAP_GRADIENT,
              )
                .map(
                  ([position, color]) => `${color} ${Number(position) * 100}%`,
                )
                .join(", ")})`,
            }}
          />
          <p style={{ margin: "4px 0 0" }}>
            Warna mendekati merah menunjukkan laporan yang lebih banyak
            berdekatan atau kerusakan yang lebih berat. Laporan tanpa penilaian
            tingkat kerusakan belum diperhitungkan dalam warna peta.
          </p>
        </div>
      )}
    </div>
  );
}

function MapControls({ reports }: { reports: Report[] }) {
  const map = useMap();
  return (
    <div className="ref-map-tools">
      <button
        type="button"
        aria-label="Perbesar peta"
        onClick={() => map.zoomIn()}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Perkecil peta"
        onClick={() => map.zoomOut()}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Atur ulang peta"
        onClick={() => {
          const points = reports
            .filter(
              (r) =>
                Number.isFinite(r.lat) &&
                Number.isFinite(r.lng) &&
                (r.lat !== 0 || r.lng !== 0),
            )
            .map((r) => [r.lat, r.lng] as [number, number]);
          if (points.length)
            map.fitBounds(points, { padding: [35, 35], maxZoom: 14 });
          else map.fitBounds(INDONESIA_BOUNDS);
        }}
      >
        ⌖
      </button>
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

  return (
    <HeatmapLayer
      points={showHeatmap ? heatmapPoints : []}
      map={map}
      config={heatmapConfig!}
    />
  );
}

function CountryBoundaries() {
  const map = useMap();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const worldUrl =
      "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

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
              color: colors.borderCard,
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

const getMarkerIcon = (status: string) => {
  let color: string = colors.warning;
  if (status === "resolved" || status === "verified") {
    color = colors.selesai;
  } else if (status === "assigned" || status === "in_progress") {
    color = colors.diproses;
  } else if (status === "under_review" || status === "needs_survey") {
    color = colors.warning;
  }

  return L.divIcon({
    html: `<div style="background:${color};width:22px;height:22px;border:3px solid white;border-radius:50%;box-shadow:0 0 0 5px ${color}2e,0 3px 8px #16302b30"></div>`,
    className: "custom-marker-icon",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
};

export const MapView = ({
  reports,
  center = INDONESIA_CENTER,
  zoom = 5,
  height = "600px",
  mode = "markers",
  heatmapConfig,
  renderPopup,
  onSelectReport,
  showDrawer = true,
  layer = "standard",
  cluster = true,
  publicMap = true,
}: MapViewProps) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityState, setFacilityState] = useState("");
  useEffect(() => {
    if (layer !== "facilities" || publicMap) return;
    let active = true;
    setFacilityState("Memuat fasilitas…");
    api
      .facilities({ limit: 100 })
      .then(async (first) => {
        const rest = await Promise.all(
          Array.from(
            {
              length: Math.max(0, Math.ceil(first.pagination.total / 100) - 1),
            },
            (_, i) => api.facilities({ limit: 100, page: i + 2 }),
          ),
        );
        if (!active) return;
        const points = [
          ...first.data,
          ...rest.flatMap((page) => page.data),
        ].filter(
          (f) =>
            Number.isFinite(f.lat) &&
            Number.isFinite(f.lng) &&
            (f.lat !== 0 || f.lng !== 0),
        );
        setFacilities(points);
        setFacilityState(
          points.length
            ? points.length + " fasilitas terpetakan"
            : "Belum ada fasilitas terpetakan",
        );
      })
      .catch(() => {
        if (active)
          setFacilityState(
            "Fasilitas gagal dimuat. Pilih ulang layer untuk mencoba lagi.",
          );
      });
    return () => {
      active = false;
    };
  }, [layer, publicMap]);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    setTileError(false);
  }, [layer]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const showMarkers = mode === "markers" || mode === "both";
  const showHeatmap = mode === "heatmap" || mode === "both";

  const handleTileError = () => {
    setTileError(true);
  };

  const handleMarkerClick = (report: Report) => {
    setSelectedReport(report);
    onSelectReport?.(report);
  };

  const handleCloseDrawer = () => {
    setSelectedReport(null);
    onSelectReport?.(null);
  };

  const markers = reports
    .filter(
      (r) =>
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng) &&
        (r.lat !== 0 || r.lng !== 0),
    )
    .map((r) => (
      <Marker
        key={r.id}
        title={r.title || r.description}
        position={[r.lat, r.lng]}
        icon={getMarkerIcon(r.status)}
        eventHandlers={{ click: () => handleMarkerClick(r) }}
      >
        {renderPopup && <Popup>{renderPopup(r)}</Popup>}
      </Marker>
    ));

  return (
    <div
      style={{
        position: "relative",
        height,
        width: "100%",
        isolation: "isolate",
      }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: "100%", zIndex: 0 }}
        maxBounds={INDONESIA_MAX_BOUNDS}
        maxBoundsViscosity={0.5}
        minZoom={3.5}
        maxZoom={18}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        worldCopyJump={false}
        zoomControl={false}
      >
        <AutoFitController reports={reports} center={center} zoom={zoom} />
        <MapControls reports={reports} />
        <TileLayer
          key={layer}
          url={
            tileError
              ? FALLBACK_TILE_URL
              : layer === "satellite"
                ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                : layer === "no_labels"
                  ? "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                  : layer === "facilities"
                    ? FALLBACK_TILE_URL
                    : TILE_URL
          }
          attribution={
            tileError
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              : layer === "satellite"
                ? "&copy; Esri, Maxar, Earthstar Geographics"
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
          }
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />
        <MapController
          reports={reports}
          showHeatmap={showHeatmap}
          heatmapConfig={heatmapConfig!}
        />
        {showMarkers &&
          (cluster ? (
            <MarkerClusterGroup
              chunkedLoading
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              zoomToBoundsOnClick
              maxClusterRadius={50}
              iconCreateFunction={(group: ClusterMarker) => {
                const count = group.getChildCount();
                const size =
                  count >= 100 ? "large" : count >= 10 ? "medium" : "small";
                const color = clusterStatusColor(
                  dominantClusterStatus(group, reports),
                );
                const halo = { small: 36, medium: 44, large: 52 }[size];
                return L.divIcon({
                  html: clusterIconHtml(count, color, size),
                  className: "",
                  iconSize: L.point(halo, halo),
                  iconAnchor: L.point(halo / 2, halo / 2),
                });
              }}
            >
              {markers}
            </MarkerClusterGroup>
          ) : (
            markers
          ))}
        {layer === "facilities" &&
          !publicMap &&
          facilities.map((facility) => (
            <Marker
              key={facility.id}
              position={[facility.lat, facility.lng]}
              title={facility.canonical_name || facility.category_name}
              icon={L.divIcon({
                className: "ref-facility-marker",
                html: "▣",
                iconSize: [22, 22],
              })}
            >
              <Tooltip permanent direction="right">
                {facility.canonical_name || facility.category_name}
              </Tooltip>
              <Popup>
                <strong>
                  {facility.canonical_name || facility.category_name}
                </strong>
                <p>{facility.report_count} laporan terkait</p>
                {facility.primary_report_id && (
                  <a href={`/system/cases/${facility.primary_report_id}`}>
                    Buka kasus terkait ↗
                  </a>
                )}
              </Popup>
            </Marker>
          ))}
        <Legend showHeatmap={showHeatmap} />
      </MapContainer>
      {((layer === "facilities" && !publicMap && facilityState) ||
        tileError) && (
        <div className="ref-map-caption" role="status">
          {layer === "facilities" && !publicMap && <span>{facilityState}</span>}
          {tileError && (
            <span>
              Peta utama gagal dimuat. Peta cadangan sedang digunakan.
            </span>
          )}
        </div>
      )}
      {publicMap && (
        <div
          className="ref-map-privacy"
          style={{
            position: "absolute",
            right: "15px",
            bottom: "15px",
            maxWidth: "190px",
            background: "#ffffffed",
            padding: "10px",
            borderRadius: "8px",
            fontSize: "10px",
            lineHeight: 1.5,
            color: colors.textTertiary,
            zIndex: 3,
          }}
        >
          Peta publik menunjukkan gambaran wilayah laporan. Gunakan informasi
          ini untuk mengenali area, bukan mencari titik rinci pelapor.
        </div>
      )}
      {showDrawer && (
        <MapDrawer
          publicMap={publicMap}
          report={selectedReport}
          open={selectedReport !== null}
          onClose={handleCloseDrawer}
        />
      )}
    </div>
  );
};
