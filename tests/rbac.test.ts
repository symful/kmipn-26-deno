import { describe, it, expect } from "vitest";
import { applyWilayahFilter } from "../src/lib/rbac.ts";

describe("RBAC — wilayah filter", () => {
  describe("applyWilayahFilter", () => {
    it("admin_global (null wilayah_id) returns query unchanged", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT 20";
      const params: unknown[] = ["submitted"];
      const result = applyWilayahFilter(sql, params, null);
      expect(result.sql).toBe(sql);
      expect(result.params).toEqual(params);
    });

    it("admin_global undefined also returns query unchanged", () => {
      const sql = "SELECT * FROM reports ORDER BY created_at DESC";
      const result = applyWilayahFilter(sql, [], undefined);
      expect(result.sql).toBe(sql);
      expect(result.params).toEqual([]);
    });

    it("injects WHERE before ORDER BY when query has no WHERE clause", () => {
      const sql = "SELECT * FROM reports ORDER BY created_at DESC LIMIT 100";
      const result = applyWilayahFilter(sql, [], "kab-A-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.params).toEqual(["kab-A-uuid"]);
    });

    it("injects AND before ORDER BY when query already has WHERE", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT 20";
      const params = ["submitted"];
      const result = applyWilayahFilter(sql, params, "kab-B-uuid");
      expect(result.sql).toContain("WHERE status = $1 AND reports.wilayah_id = $2");
      expect(result.params).toEqual(["submitted", "kab-B-uuid"]);
    });

    it("injects filter before LIMIT with existing WHERE", () => {
      const sql = "SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
      const params: unknown[] = ["verified", 20, 0];
      const result = applyWilayahFilter(sql, params, "kab-C-uuid");
      expect(result.sql).toContain("AND reports.wilayah_id = $4");
      expect(result.sql).toContain("LIMIT $2 OFFSET $3");
      expect(result.params).toEqual(["verified", 20, 0, "kab-C-uuid"]);
    });

    it("injects filter before GROUP BY", () => {
      const sql = "SELECT status, COUNT(*) FROM reports GROUP BY status";
      const result = applyWilayahFilter(sql, [], "kab-D-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("GROUP BY status");
      expect(result.params).toEqual(["kab-D-uuid"]);
    });

    it("kabupaten-A user cannot see kab-B data", () => {
      const kabASql = "SELECT * FROM reports WHERE status = $1";
      const resultA = applyWilayahFilter(kabASql, ["submitted"], "kab-A-uuid");
      const resultB = applyWilayahFilter(kabASql, ["submitted"], "kab-B-uuid");
      expect(resultA.params).toEqual(["submitted", "kab-A-uuid"]);
      expect(resultB.params).toEqual(["submitted", "kab-B-uuid"]);
      expect(resultA.params[1]).not.toBe(resultB.params[1]);
    });

    it("admin sees all (null wilayah_id) — query unchanged", () => {
      const sql = "SELECT * FROM reports WHERE status = $1";
      const result = applyWilayahFilter(sql, ["submitted"], null);
      expect(result.sql).toBe(sql);
      expect(result.params).toEqual(["submitted"]);
    });

    it("custom table alias is respected in condition", () => {
      const sql = "SELECT * FROM reports r WHERE r.status = $1";
      const result = applyWilayahFilter(sql, ["submitted"], "kab-X-uuid", "r");
      expect(result.sql).toContain("r.wilayah_id = $2");
      expect(result.params).toEqual(["submitted", "kab-X-uuid"]);
    });

    it("injects WHERE before LIMIT when no WHERE clause exists", () => {
      const sql = "SELECT * FROM reports LIMIT 50";
      const result = applyWilayahFilter(sql, [], "kab-Y-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("LIMIT 50");
      expect(result.params).toEqual(["kab-Y-uuid"]);
    });

    it("handles query with HAVING clause", () => {
      const sql = "SELECT status, COUNT(*) FROM reports GROUP BY status HAVING COUNT(*) > 1";
      const result = applyWilayahFilter(sql, [], "kab-Z-uuid");
      expect(result.sql).toContain("WHERE reports.wilayah_id = $1");
      expect(result.sql).toContain("GROUP BY status");
      expect(result.sql).toContain("HAVING COUNT(*) > 1");
    });
  });
});
