import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";
import { colors } from "../theme/tokens";
import { logger } from "@/lib/logger";

interface MiniMapClusterProps {
  className?: string;
}

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const INDONESIA_CENTER: [number, number] = [-2.548926, 118.0148634]; // Indonesia center (matches MapView)

const getMarkerIcon = (status: string) => {
  let color: string = colors.perluTindakan;
  if (status === "resolved") {
    color = colors.selesai;
  } else if (status === "verified" || status === "in_progress") {
    color = colors.diproses;
  } else if (status === "under_review" || status === "needs_survey") {
    color = colors.warning;
  }

  return L.divIcon({
    html: `<div class="w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center" style="background-color: ${color}; width: 20px; height: 20px;">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
           </div>`,
    className: "custom-mini-marker",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

interface MiniMapMarker {
  id: string;
  status: string;
  categoryName: string;
  lat: number;
  lng: number;
}

export function MiniMapCluster({ className = "" }: MiniMapClusterProps) {
  const [reports, setReports] = useState<MiniMapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .geojson()
      .then((geojsonData) => {
        if (!cancelled) {
          const mapped = geojsonData.features
            .map((f) => ({
              id: f.properties.id,
              status: f.properties.status,
              categoryName: f.properties.category_id || "Laporan",
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
            }))
            .filter(
              (r) =>
                typeof r.lat === "number" &&
                typeof r.lng === "number" &&
                !isNaN(r.lat) &&
                !isNaN(r.lng),
            );
          setReports(mapped);
          setLoading(false);
        }
      })
      .catch((err) => {
        logger.error("Failed to fetch mini-map geojson:", { error: err });
        if (!cancelled) {
          setError("Gagal memuat peta");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const first = reports[0];
  const center: [number, number] = first
    ? [first.lat, first.lng]
    : INDONESIA_CENTER;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.background,
        borderRadius: 13,
        height: "100%",
        minHeight: "150px",
      }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60">
          <div className="w-5 h-5 border-2 border-sigap-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60">
          <span className="text-xs text-sigap-textMuted">{error}</span>
        </div>
      )}

      {!loading && !error && (
        <MapContainer
          center={center}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          scrollWheelZoom={false}
          dragging={false}
          doubleClickZoom={false}
        >
          <TileLayer
            url={TILE_URL}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {(reports ?? []).map((r, index) => (
            <Marker
              key={r.id || index}
              position={[r.lat, r.lng]}
              icon={getMarkerIcon(r.status)}
            >
              <Popup>
                <div className="text-xs">
                  <strong>{r.categoryName}</strong>
                  <br />
                  Status: {r.status}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
