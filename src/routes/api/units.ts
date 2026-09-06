import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "@/types/bindings";
import { type AuthVariables } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { safeHandler } from "@/lib/safeHandler";
import { parseJson, parseQuery } from "@/lib/validation";
import { prepareAuditStatement } from "@/lib/audit";
const fields = z.object({
  nama: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  alamat: z.string().max(1000).nullable().optional(),
  kontak: z.string().max(100).nullable().optional(),
  is_active: z.boolean().optional(),
});
const create = fields.refine((v) => !!(v.nama ?? v.name), {
  message: "Isi nama unit.",
});
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  is_active: z.enum(["true", "false"]).optional(),
});
interface UnitRow {
  id: string;
  nama: string;
  alamat: string | null;
  kontak: string | null;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
const publicUnit = (u: UnitRow) => ({
  ...u,
  name: u.nama,
  is_active: !!u.is_active,
});
export const unitsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();
unitsRoute.use("*", requireRole("ADMIN"));
unitsRoute.get(
  "/",
  safeHandler(async (c) => {
    const q = parseQuery(c, querySchema),
      where: string[] = [],
      params: unknown[] = [];
    if (q.search) {
      where.push("nama LIKE ?");
      params.push("%" + q.search + "%");
    }
    if (q.is_active) {
      where.push("is_active=?");
      params.push(q.is_active === "true" ? 1 : 0);
    }
    const clause = where.length ? "WHERE " + where.join(" AND ") : "";
    const total =
      (
        await c.env.D1.prepare(`SELECT COUNT(*) total FROM units ${clause}`)
          .bind(...params)
          .first<{ total: number }>()
      )?.total ?? 0;
    const rows = await c.env.D1.prepare(
      `SELECT * FROM units ${clause} ORDER BY nama,id LIMIT ? OFFSET ?`,
    )
      .bind(...params, q.limit, (q.page - 1) * q.limit)
      .all<UnitRow>();
    return c.json({
      items: rows.results.map(publicUnit),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        total_pages: Math.ceil(total / q.limit),
      },
    });
  }),
);
unitsRoute.get(
  "/:id",
  safeHandler(async (c) => {
    const row = await c.env.D1.prepare("SELECT * FROM units WHERE id=?")
      .bind(c.req.param("id"))
      .first<UnitRow>();
    return row
      ? c.json(publicUnit(row))
      : c.json(
          { error: { code: "NOT_FOUND", message: "Unit tidak ditemukan." } },
          404,
        );
  }),
);
unitsRoute.post(
  "/",
  safeHandler(async (c) => {
    const body = await parseJson(c, create),
      id = crypto.randomUUID(),
      user = c.get("user");
    const after = {
      nama: body.nama ?? body.name!,
      alamat: body.alamat ?? null,
      kontak: body.kontak ?? null,
      is_active: body.is_active ?? true,
    };
    await c.env.D1.batch([
      c.env.D1.prepare(
        "INSERT INTO units(id,nama,alamat,kontak,is_active,created_by) VALUES(?,?,?,?,?,?)",
      ).bind(
        id,
        after.nama,
        after.alamat,
        after.kontak,
        after.is_active ? 1 : 0,
        user.sub,
      ),
      prepareAuditStatement(c.env, {
        actor: user.sub,
        activeRole: user.role,
        action: "unit_create",
        objectType: "unit",
        objectId: id,
        after,
      }),
    ]);
    const row = await c.env.D1.prepare("SELECT * FROM units WHERE id=?")
      .bind(id)
      .first<UnitRow>();
    return c.json(publicUnit(row!), 201);
  }),
);
const update = safeHandler(async (c) => {
  const body = await parseJson(c, fields),
    id = c.req.param("id"),
    user = c.get("user");
  if (!Object.keys(body).length)
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Tidak ada perubahan unit.",
        },
      },
      400,
    );
  const before = await c.env.D1.prepare("SELECT * FROM units WHERE id=?")
    .bind(id)
    .first<UnitRow>();
  if (!before)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Unit tidak ditemukan." } },
      404,
    );
  if (body.is_active === false) {
    const active = await c.env.D1.prepare(
      "SELECT COUNT(*) total FROM tasks WHERE unit_id=? AND status NOT IN ('completed','rejected')",
    )
      .bind(id)
      .first<{ total: number }>();
    if (active?.total)
      return c.json(
        {
          error: {
            code: "UNIT_IN_USE",
            message:
              "Unit masih menangani tugas aktif. Selesaikan atau alihkan tugas terlebih dahulu.",
          },
        },
        409,
      );
  }
  const after = {
    nama: body.nama ?? body.name ?? before.nama,
    alamat: body.alamat === undefined ? before.alamat : body.alamat,
    kontak: body.kontak === undefined ? before.kontak : body.kontak,
    is_active: body.is_active ?? !!before.is_active,
  };
  await c.env.D1.batch([
    c.env.D1.prepare(
      "UPDATE units SET nama=?,alamat=?,kontak=?,is_active=?,updated_at=datetime('now') WHERE id=?",
    ).bind(after.nama, after.alamat, after.kontak, after.is_active ? 1 : 0, id),
    prepareAuditStatement(c.env, {
      actor: user.sub,
      activeRole: user.role,
      action: "unit_update",
      objectType: "unit",
      objectId: id,
      before,
      after,
    }),
  ]);
  return c.json(
    publicUnit(
      (await c.env.D1.prepare("SELECT * FROM units WHERE id=?")
        .bind(id)
        .first<UnitRow>())!,
    ),
  );
});
unitsRoute.put("/:id", update);
unitsRoute.patch("/:id", update);
unitsRoute.delete(
  "/:id",
  safeHandler(async (c) => {
    const id = c.req.param("id"),
      user = c.get("user"),
      before = await c.env.D1.prepare("SELECT * FROM units WHERE id=?")
        .bind(id)
        .first<UnitRow>();
    if (!before)
      return c.json(
        { error: { code: "NOT_FOUND", message: "Unit tidak ditemukan." } },
        404,
      );
    const refs = await c.env.D1.prepare(
      "SELECT COUNT(*) total FROM tasks WHERE unit_id=?",
    )
      .bind(id)
      .first<{ total: number }>();
    if (refs?.total)
      return c.json(
        {
          error: {
            code: "UNIT_IN_USE",
            message:
              "Riwayat tugas masih memakai unit ini. Nonaktifkan unit setelah tugas aktif selesai agar riwayat tetap tersedia.",
          },
        },
        409,
      );
    await c.env.D1.batch([
      c.env.D1.prepare("DELETE FROM units WHERE id=?").bind(id),
      prepareAuditStatement(c.env, {
        actor: user.sub,
        activeRole: user.role,
        action: "unit_delete",
        objectType: "unit",
        objectId: id,
        before,
      }),
    ]);
    return c.json({ success: true, message: "Unit berhasil dihapus." });
  }),
);
