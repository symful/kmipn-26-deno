import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = { query: vi.fn(), end: vi.fn(), connect: vi.fn() };

const { withClientMock } = vi.hoisted(() => {
  const fn = vi.fn(async (_env: unknown, fn: (client: typeof mockClient) => Promise<unknown>) => {
    return await fn(mockClient as unknown as typeof mockClient);
  });
  return { withClientMock: fn };
});

const { callLLMMock } = vi.hoisted(() => ({ callLLMMock: vi.fn() }));
const { findDupsMock } = vi.hoisted(() => ({ findDupsMock: vi.fn() }));

vi.mock("pg", () => ({ Client: vi.fn(() => mockClient) }));
vi.mock("@/lib/db", () => ({ withClient: withClientMock }));
vi.mock("@/lib/agent/store", () => ({ saveAssessment: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/agent/llm", () => ({ callLLM: callLLMMock }));
vi.mock("@/lib/agent/duplicates", () => ({ findDuplicates: findDupsMock }));

vi.mock("@/config/env", () => ({
  getConfig: vi.fn(() => ({ DUPLICATE_RADIUS_METERS: 50, DUPLICATE_LIMIT: 10 })),
}));

import completenessTool from "../../src/lib/agent/tools/completeness";
import duplicatesTool from "../../src/lib/agent/tools/duplicates";
import mediaQualityTool from "../../src/lib/agent/tools/mediaQuality";
import classifyProblemTool from "../../src/lib/agent/tools/classifyProblem";
import extractDamageTool from "../../src/lib/agent/tools/extractDamage";
import privacyRiskTool from "../../src/lib/agent/tools/privacyRisk";

function makeEnv() {
  return {
    JWT_SECRET: "test",
    LLM_API_URI: "http://test",
    LLM_API_KEY: "test",
    TEXT_MODEL_NAME: "test-text",
    VISION_MODEL_NAME: "test-vision",
  } as unknown as Parameters<typeof completenessTool.execute>[0];
}

const TEST_REPORT_ID = "11111111-1111-1111-1111-111111111111";
const TEST_CATEGORY_ID = "22222222-2222-2222-2222-222222222222";

describe("agent tools throw on failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    callLLMMock.mockReset();
    findDupsMock.mockReset();
  });

  it("completeness throws when DB query fails", async () => {
    withClientMock.mockImplementationOnce(() => { throw new Error("Database connection failed"); });

    await expect(
      completenessTool.execute(makeEnv(), { report_id: TEST_REPORT_ID })
    ).rejects.toThrow("assess_completeness failed: Database connection failed");
  });

  it("duplicates throws when findDuplicates fails", async () => {
    findDupsMock.mockRejectedValueOnce(new Error("Duplicate search failed"));

    await expect(
      duplicatesTool.execute(makeEnv(), {
        report_id: TEST_REPORT_ID, lng: 106.816, lat: -6.2, category_id: TEST_CATEGORY_ID,
      })
    ).rejects.toThrow("find_duplicates failed: Duplicate search failed");
  });

  it("mediaQuality throws when LLM call fails", async () => {
    callLLMMock.mockRejectedValueOnce(new Error("Vision model timeout"));

    await expect(
      mediaQualityTool.execute(makeEnv(), {
        report_id: TEST_REPORT_ID, image_url: "https://example.com/photo.jpg",
        category_name: "roads", description: "Pothole on main road",
      })
    ).rejects.toThrow("assess_media_quality failed: Vision model timeout");
  });

  it("classifyProblem throws when LLM call fails", async () => {
    callLLMMock.mockRejectedValueOnce(new Error("Text model error"));

    await expect(
      classifyProblemTool.execute(makeEnv(), {
        report_id: TEST_REPORT_ID, description: "Road damage", category_name: "roads",
      })
    ).rejects.toThrow("classify_problem failed: Text model error");
  });

  it("extractDamage throws when LLM call fails", async () => {
    callLLMMock.mockRejectedValueOnce(new Error("Vision API unavailable"));

    await expect(
      extractDamageTool.execute(makeEnv(), {
        report_id: TEST_REPORT_ID, image_url: "https://example.com/damage.jpg",
        category_name: "bridges", description: "Crack in bridge",
      })
    ).rejects.toThrow("extract_damage_indicators failed: Vision API unavailable");
  });

  it("privacyRisk throws when text LLM call fails", async () => {
    callLLMMock.mockRejectedValueOnce(new Error("Text analysis failed"));

    await expect(
      privacyRiskTool.execute(makeEnv(), {
        report_id: TEST_REPORT_ID, description: "Face visible", image_url: "https://example.com/photo.jpg",
      })
    ).rejects.toThrow("detect_privacy_risk failed: Text analysis failed");
  });

  it("privacyRisk throws when vision LLM call fails (after text succeeds)", async () => {
    callLLMMock.mockResolvedValueOnce({
      pii_detected: false, pii_types: [], redaction_needed: false,
      confidence: 0.9, supporting_factors: [], risk_factors: [], correlation_ids: [], status: "no_risk" as const,
    });
    callLLMMock.mockRejectedValueOnce(new Error("Vision analysis failed"));

    await expect(
      privacyRiskTool.execute(makeEnv(), {
        report_id: TEST_REPORT_ID, description: "Infrastructure", image_url: "https://example.com/photo.jpg",
      })
    ).rejects.toThrow("detect_privacy_risk failed: Vision analysis failed");
  });

  it("tools that throw produce errors in orchestrator format", async () => {
    withClientMock.mockImplementationOnce(() => { throw new Error("DB unavailable"); });

    try {
      await completenessTool.execute(makeEnv(), { report_id: TEST_REPORT_ID });
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("assess_completeness failed:");
      expect((e as Error).message).toContain("DB unavailable");
    }
  });
});
