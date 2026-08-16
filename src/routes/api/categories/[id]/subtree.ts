import { Hono } from "hono";
import type { Env } from "@/types/bindings";
import { requireAuth } from "@/lib/auth";
import { safeHandler } from "@/lib/safeHandler";
import { withClient } from "@/lib/db";

interface CategoryNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  code: string | null;
  short_code: string | null;
  color_class: string | null;
  icon: string | null;
  children: CategoryNode[];
}

export const categorySubtreeRoute = new Hono<{ Bindings: Env }>();

categorySubtreeRoute.get("/", requireAuth, safeHandler(async (c) => {
  const categoryId = c.req.param("id");

  const rows = await withClient(c.env, async (client) => {
    const r = await client.query(
      `WITH RECURSIVE category_tree AS (
        SELECT id, parent_id, name, slug, code, short_code, color_class, icon, 0 as depth
        FROM categories WHERE id = $1
        UNION ALL
        SELECT c.id, c.parent_id, c.name, c.slug, c.code, c.short_code, c.color_class, c.icon, ct.depth + 1
        FROM categories c
        JOIN category_tree ct ON ct.id = c.parent_id
      )
      SELECT id, parent_id, name, slug, code, short_code, color_class, icon, depth
      FROM category_tree
      ORDER BY depth, name`,
      [categoryId]
    );
    return r.rows as Array<{
      id: string;
      parent_id: string | null;
      name: string;
      slug: string;
      code: string | null;
      short_code: string | null;
      color_class: string | null;
      icon: string | null;
      depth: number;
    }>;
  });

  // Build nested tree structure
  const nodeMap = new Map<string, CategoryNode>();
  const rootNodes: CategoryNode[] = [];

  // First pass: create all nodes with empty children arrays
  for (const row of rows) {
    nodeMap.set(row.id, {
      id: row.id,
      parent_id: row.parent_id,
      name: row.name,
      slug: row.slug,
      code: row.code,
      short_code: row.short_code,
      color_class: row.color_class,
      icon: row.icon,
      children: [],
    });
  }

  // Second pass: link children to parents
  for (const row of rows) {
    const node = nodeMap.get(row.id)!;
    if (row.parent_id && nodeMap.has(row.parent_id)) {
      nodeMap.get(row.parent_id)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Return the requested category (first root node = the requested id)
  const subtree = rootNodes[0] ?? null;

  return c.json({ category: subtree });
}));
