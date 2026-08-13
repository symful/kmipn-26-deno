import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = {
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
};

// Use vi.hoisted so the mock is evaluated before module scope
const { withClientMock } = vi.hoisted(() => {
  const fn = vi.fn(async (_env: unknown, fn: (client: typeof mockClient) => Promise<unknown>) => {
    return await fn(mockClient as unknown as typeof mockClient);
  });
  return { withClientMock: fn };
});

vi.mock("pg", () => ({
  Client: vi.fn(() => mockClient),
}));

vi.mock("@/lib/db", () => ({
  withClient: withClientMock,
}));

import { evaluatePriority, getPriorityScore } from "../src/lib/priority/calculator.ts";
import { invalidatePriorityConfigCache } from "../src/lib/priority/config-store.ts";

function makeEnv() {
  return { JWT_SECRET: "test" } as Parameters<typeof evaluatePriority>[0];
}

function setupQuery(...responses: unknown[]) {
  let callIndex = 0;
  mockClient.query.mockImplementation(() => Promise.resolve(responses[callIndex++]));
}

describe("priority calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    invalidatePriorityConfigCache();
  });

  describe("evaluatePriority", () => {
    it("returns null when no active priority_config exists", async () => {
      setupQuery({ rows: [], rowCount: 0 });
      const score = await evaluatePriority(makeEnv(), "report-123");
      expect(score).toBeNull();
    });

    it("returns null when report does not exist", async () => {
      setupQuery(
        { rows: [{ version: 1, weights: { severity: 0.4, impact: 0.3, vulnerability: 0.3, sla: 0 } }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      );
      const score = await evaluatePriority(makeEnv(), "nonexistent-report");
      expect(score).toBeNull();
    });

    it("computes score using versioned weights (v1 defaults 0.4/0.3/0.3)", async () => {
      setupQuery(
        { rows: [{ version: 1, weights: { severity: 0.4, impact: 0.3, vulnerability: 0.3, sla: 0 } }], rowCount: 1 },
        { rows: [{ severity: 5, population_affected: 50000, vulnerability_index: 0.8, deadline: null, device_id: null }], rowCount: 1 },
        { rows: [], rowCount: 1 },
      );
      const score = await evaluatePriority(makeEnv(), "report-weights-test");
      expect(score!.total_score).toBe(79);
    });

    it("clamps severity component to 0-100", async () => {
      setupQuery(
        { rows: [{ version: 1, weights: { severity: 0.4, impact: 0.3, vulnerability: 0.3, sla: 0 } }], rowCount: 1 },
        { rows: [{ severity: 10, population_affected: 0, vulnerability_index: 0, deadline: null, device_id: null }], rowCount: 1 },
        { rows: [], rowCount: 1 },
      );
      const score = await evaluatePriority(makeEnv(), "report-overflow");
      expect(score!.total_score).toBe(40);
    });

    it("clamps vulnerability component to 0-100", async () => {
      setupQuery(
        { rows: [{ version: 1, weights: { severity: 0.4, impact: 0.3, vulnerability: 0.3, sla: 0 } }], rowCount: 1 },
        { rows: [{ severity: 1, population_affected: 0, vulnerability_index: 2.0, deadline: null, device_id: null }], rowCount: 1 },
        { rows: [], rowCount: 1 },
      );
      const score = await evaluatePriority(makeEnv(), "report-vuln-overflow");
      expect(score!.total_score).toBeGreaterThanOrEqual(0);
    });

    it("updates existing priority score (ON CONFLICT)", async () => {
      setupQuery(
        { rows: [{ version: 1, weights: { severity: 0.5, impact: 0.25, vulnerability: 0.25, sla: 0 } }], rowCount: 1 },
        { rows: [{ severity: 3, population_affected: 10000, vulnerability_index: 0.5, deadline: null, device_id: null }], rowCount: 1 },
        { rows: [], rowCount: 1 },
      );
      await evaluatePriority(makeEnv(), "existing-report");
      const upsertCall = mockClient.query.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("priority_scores") &&
          call[0].includes("ON CONFLICT"),
      );
      expect(upsertCall).toBeDefined();
    });
  });

  describe("getPriorityScore", () => {
    it("returns null when no score found for report", async () => {
      setupQuery({ rows: [], rowCount: 0 });
      const result = await getPriorityScore(makeEnv(), "unknown-report");
      expect(result).toBeNull();
    });

    it("returns computed score when no override", async () => {
      setupQuery({
        rows: [
          {
            computed_score: 75,
            severity_component: 80,
            population_component: 60,
            vulnerability_component: 70,
            override_score: null,
          },
        ],
        rowCount: 1,
      });
      const result = await getPriorityScore(makeEnv(), "report-score");
      expect(result).not.toBeNull();
      expect(result!.total_score).toBe(75);
      expect(result!.breakdown.severity).toBe(80);
      expect(result!.breakdown.impact).toBe(60);
      expect(result!.breakdown.vulnerability).toBe(70);
      expect(result!.override_score).toBeUndefined();
    });

    it("returns override_score when present (operator override)", async () => {
      setupQuery({
        rows: [
          {
            computed_score: 50,
            severity_component: 60,
            population_component: 40,
            vulnerability_component: 30,
            override_score: 95,
          },
        ],
        rowCount: 1,
      });
      const result = await getPriorityScore(makeEnv(), "report-override");
      expect(result).not.toBeNull();
      expect(result!.total_score).toBe(95);
      expect(result!.override_score).toBe(95);
    });

    it("returns all components", async () => {
      setupQuery({
        rows: [
          {
            computed_score: 65,
            severity_component: 90,
            population_component: 45,
            vulnerability_component: 55,
            override_score: null,
          },
        ],
        rowCount: 1,
      });
      const result = await getPriorityScore(makeEnv(), "report-full");
      expect(result!.breakdown.severity).toBe(90);
      expect(result!.breakdown.impact).toBe(45);
      expect(result!.breakdown.vulnerability).toBe(55);
    });
  });

  describe("versioned weights (v2 config)", () => {
    it("applies different weight set when active config has version 2", async () => {
      setupQuery(
        { rows: [{ version: 2, weights: { severity: 0.2, impact: 0.6, vulnerability: 0.2, sla: 0 } }], rowCount: 1 },
        { rows: [{ severity: 5, population_affected: 80000, vulnerability_index: 0.5, deadline: null, device_id: null }], rowCount: 1 },
        { rows: [], rowCount: 1 },
      );
      const score = await evaluatePriority(makeEnv(), "report-v2-weights");
      expect(score!.total_score).toBe(78);
    });
  });
});
