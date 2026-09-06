import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { rateLimit } from "@/lib/ratelimit";

const mapRoutes = new Hono<{ Bindings: Env }>();

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

// GET /api/map/heatmap — PUBLIC
mapRoutes.use(
  "/heatmap",
  rateLimit({
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    keyBy: (c) => c.req.header("cf-connecting-ip") ?? "anonymous",
  }),
);

mapRoutes.get("/heatmap", async (c) => {
  const MAX_POINTS = 5000;

  // rows have no reporter identity columns — only lat/lng selected
  const rows = await c.env.D1.prepare(
    `SELECT lat, lng FROM reports WHERE lat IS NOT NULL AND lng IS NOT NULL`,
  ).all<{ lat: number; lng: number }>();

  const points = rows.results ?? [];

  if (points.length <= MAX_POINTS) {
    return c.json({
      points: points.map((p) => ({ lat: p.lat, lng: p.lng, weight: 1 })),
    });
  }

  const buckets = new Map<
    string,
    { lat: number; lng: number; weight: number }
  >();

  for (const p of points) {
    const bucketLat = Math.round(p.lat * 100) / 100;
    const bucketLng = Math.round(p.lng * 100) / 100;
    const key = `${bucketLat},${bucketLng}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      buckets.set(key, { lat: bucketLat, lng: bucketLng, weight: 1 });
    }
  }

  const clustered = Array.from(buckets.values());
  const result =
    clustered.length > MAX_POINTS ? clustered.slice(0, MAX_POINTS) : clustered;

  return c.json({ points: result });
});

// GET /api/map/geojson — PUBLIC
mapRoutes.use(
  "/geojson",
  rateLimit({
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    keyBy: (c) => c.req.header("cf-connecting-ip") ?? "anonymous",
  }),
);

mapRoutes.get("/geojson", async (c) => {
  const MAX_FEATURES = 5000;
  const kecamatan = c.req.query("kecamatan");
  const kelurahan = c.req.query("kelurahan");
  const fromDate = c.req.query("from");
  const toDate = c.req.query("to");

  let sql = `SELECT id, category_id, status, lat, lng, created_at, description, impact, address_area FROM reports WHERE lat IS NOT NULL AND lng IS NOT NULL`;
  const params: (string | number)[] = [];

  if (kecamatan) {
    sql += ` AND kecamatan = ?`;
    params.push(kecamatan);
  }
  if (kelurahan) {
    sql += ` AND kelurahan = ?`;
    params.push(kelurahan);
  }

  if (fromDate) {
    sql += ` AND created_at >= ?`;
    params.push(fromDate);
  }
  if (toDate) {
    // Include the full day by using 23:59:59 for the end date
    sql += ` AND created_at <= ?`;
    params.push(`${toDate} 23:59:59`);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  const fetchLimit = MAX_FEATURES + 1;
  params.push(fetchLimit);

  const rows = await c.env.D1.prepare(sql)
    .bind(...params)
    .all<{
      id: string;
      category_id: string;
      status: string;
      lat: number;
      lng: number;
      created_at: string;
      description: string;
      impact: unknown;
      address_area: string | null;
    }>();

  const rawPoints = rows.results ?? [];
  const hasMore = rawPoints.length > MAX_FEATURES;
  const points = hasMore ? rawPoints.slice(0, MAX_FEATURES) : rawPoints;

  const features = points.map((p) => {
    const impact =
      typeof p.impact === "string" ? JSON.parse(p.impact) : (p.impact ?? {});
    const severity =
      typeof (impact as any)?.severity === "number"
        ? (impact as any).severity
        : null;
    return {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lng, p.lat], // GeoJSON order: [lng, lat]
      },
      properties: {
        id: p.id,
        category_id: p.category_id,
        status: p.status,
        severity,
        created_at: p.created_at,
        description: p.description,
        address_area: p.address_area ?? null,
      },
    };
  });

  return c.json({
    type: "FeatureCollection",
    features,
    ...(hasMore ? { _truncated: true } : {}),
  });
});

export { mapRoutes };
