import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

function Selection({
  point,
  onChange,
}: {
  point: [number, number] | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useMapEvents({
    click: (event) => onChange(event.latlng.lat, event.latlng.lng),
  });
  useEffect(() => {
    if (point) map.setView(point, Math.max(map.getZoom(), 13));
  }, [point?.[0], point?.[1], map]);
  return point ? (
    <CircleMarker
      center={point}
      radius={7}
      pathOptions={{ color: "#147967", fillOpacity: 1 }}
    />
  ) : null;
}
export function ReportLocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: string;
  lng: string;
  onChange: (lat: number, lng: number) => void;
}) {
  const point: [number, number] | null =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180
      ? [Number(lat), Number(lng)]
      : null;
  return (
    <MapContainer
      center={point ?? [-2.5489, 118.0149]}
      zoom={point ? 13 : 4}
      style={{ height: 180, width: "100%", borderRadius: 8 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
      />
      <Selection point={point} onChange={onChange} />
    </MapContainer>
  );
}
