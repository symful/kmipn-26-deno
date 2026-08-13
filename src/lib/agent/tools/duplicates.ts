import { z } from "zod";
import { findDuplicates as findDups } from "@/lib/agent/duplicates";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import { getConfig } from "@/config/env";

export const duplicatesInputSchema = z.object({
  report_id: z.string().uuid(),
  lng: z.number(),
  lat: z.number(),
  category_id: z.string().uuid(),
});

export const duplicatesOutputSchema = z.object({
  duplicates_found: z.boolean(),
  candidates: z.array(
    z.object({
      report_id: z.string().uuid(),
      similarity_score: z.number().min(0).max(1),
      distance_meters: z.number(),
    })
  ),
  confidence: z.number().min(0).max(1),
  correlation_ids: z.array(z.string().uuid()),
});

export type DuplicatesInput = z.infer<typeof duplicatesInputSchema>;
export type DuplicatesOutput = z.infer<typeof duplicatesOutputSchema>;

const duplicatesTool = {
  name: "find_duplicates",
  description: "Finds potential duplicate reports within radius based on location and category. Returns list of nearby reports.",
  model: null as "vision" | "text" | "both" | null,
  inputSchema: duplicatesInputSchema,
  outputSchema: duplicatesOutputSchema,

  promptBuilder: (): string => {
    return "This tool is pure SQL - no LLM prompt needed";
  },

  execute: async (env: Env, input: DuplicatesInput): Promise<DuplicatesOutput> => {
    try {
      const inputValidation = duplicatesInputSchema.safeParse(input);
      if (!inputValidation.success) {
        return {
          duplicates_found: false,
          candidates: [],
          confidence: 0,
          correlation_ids: [],
        };
      }

      const config = getConfig(env as unknown as Record<string, string | undefined>);
      const DUPLICATE_RADIUS_METERS = config.DUPLICATE_RADIUS_METERS ?? 50;
      const DUPLICATE_LIMIT = config.DUPLICATE_LIMIT ?? 10;

      const candidates = await findDups(
        env,
        input.lng,
        input.lat,
        input.category_id,
        input.report_id,
        DUPLICATE_RADIUS_METERS,
        DUPLICATE_LIMIT
      );

      const duplicates_found = candidates.length > 0;

      const scoredCandidates = candidates.map((c) => ({
        report_id: c.report_id,
        similarity_score: Math.max(0, 1 - (c.distance_m / DUPLICATE_RADIUS_METERS)),
        distance_meters: c.distance_m,
      }));

      scoredCandidates.sort((a, b) => b.similarity_score - a.similarity_score);

      const topCandidate = scoredCandidates[0];
      const confidence = duplicates_found && topCandidate
        ? Math.min(1.0, topCandidate.similarity_score + 0.1)
        : 0.5;

      const correlation_ids = [input.report_id, ...scoredCandidates.map((c) => c.report_id)];

      const result = {
        duplicates_found,
        candidates: scoredCandidates,
        confidence,
        correlation_ids,
      };

      const supporting_factors: string[] = [];
      if (!duplicates_found) supporting_factors.push("no_duplicates_found");

      const risk_factors: string[] = [];
      if (duplicates_found) risk_factors.push("potential_duplicate");

      await saveAssessment(env, {
        tool_name: "find_duplicates",
        report_id: input.report_id,
        model_version: "1.0.0",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        idempotency_key: `find_duplicates_${input.report_id}_${crypto.randomUUID()}`,
        status: "completed",
        result,
      });

      return result;
    } catch (e) {
      throw new Error(`find_duplicates failed: ${(e as Error).message}`);
    }
  },
};

export default duplicatesTool;
