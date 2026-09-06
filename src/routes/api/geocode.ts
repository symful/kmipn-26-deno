import { Hono } from "hono";
import type { Env } from "../../types/bindings";
import { GeocodingError, reverseGeocode } from "../../lib/geocoding";

export const geocodeRoute = new Hono<{ Bindings: Env }>();
geocodeRoute.get("/reverse", async (c) => {
  const lat = c.req.query("lat"),
    lng = c.req.query("lng");
  if (!lat?.trim() || !lng?.trim())
    return c.json(
      {
        error: {
          code: "INVALID_LOCATION",
          message: "Lintang dan bujur wajib diisi.",
        },
      },
      400,
    );
  try {
    return c.json(await reverseGeocode(c.env, Number(lat), Number(lng)));
  } catch (error) {
    if (error instanceof GeocodingError)
      return c.json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    return c.json(
      {
        error: {
          code: "GEOCODING_UNAVAILABLE",
          message:
            "Alamat belum berhasil ditemukan. Coba kembali atau isi alamat secara manual.",
        },
      },
      502,
    );
  }
});
