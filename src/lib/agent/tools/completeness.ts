import { z } from "zod";
import { withClient } from "@/lib/db";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";

/** Input: report ID to check for data completeness */
export const completenessInputSchema = z.object({
  report_id: z.string().uuid(),
});

/** Output: completeness assessment result */
export const completenessOutputSchema = z.object({
  complete: z.boolean(),
  missing_fields: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
});

export type CompletenessInput = z.infer<typeof completenessInputSchema>;
export type CompletenessOutput = z.infer<typeof completenessOutputSchema>;

const REQUIRED_REPORT_FIELDS = [
  "title",
  "description",
  "category_id",
  "location",
  "photo_urls",
] as const;

const completenessTool = {
  name: "assess_completeness",
  description: "Checks if a report has all required fields filled. Returns missing fields list and confidence score.",
  model: null as "vision" | "text" | "both" | null,
  inputSchema: completenessInputSchema,
  outputSchema: completenessOutputSchema,

  promptBuilder: (_input: CompletenessInput): string => {
    return "This tool is pure code - no LLM prompt needed";
  },

  execute: async (env: Env, input: CompletenessInput): Promise<CompletenessOutput> => {
    try {
      const result = await withClient(env, async (client) => {
        const res = await client.query<{
          title: string | null;
          description: string | null;
          category_id: string | null;
          location: unknown;
          photo_urls: string[] | null;
        }>(
          `SELECT title, description, category_id, location, photo_urls
           FROM reports WHERE id = $1`,
          [input.report_id]
        );
        return res.rows[0];
      });

      if (!result) {
        return {
          complete: false,
          missing_fields: ["report_not_found"],
          confidence: 0,
          supporting_factors: [],
          risk_factors: ["report_not_found"],
          correlation_ids: [input.report_id],
        };
      }

      const missing_fields: string[] = [];

      if (!result.title || result.title.trim().length === 0) {
        missing_fields.push("title");
      }
      if (!result.description || result.description.trim().length === 0) {
        missing_fields.push("description");
      }
      if (!result.category_id) {
        missing_fields.push("category_id");
      }
      if (!result.location) {
        missing_fields.push("location");
      }
      if (!result.photo_urls || result.photo_urls.length === 0) {
        missing_fields.push("photo_urls");
      }

      const complete = missing_fields.length === 0;
      const confidence = complete ? 1.0 : Math.max(0, 1 - missing_fields.length * 0.2);

      const supporting_factors = REQUIRED_REPORT_FIELDS
        .filter((field) => !missing_fields.includes(field))
        .map((field) => `has_${field}`);
      const risk_factors = missing_fields.map((field) => `missing_${field}`);
      const correlation_ids = [input.report_id];

      await saveAssessment(env, {
        tool_name: "assess_completeness",
        report_id: input.report_id,
        model_version: "1.0.0",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        idempotency_key: `assess_completeness_${input.report_id}_${crypto.randomUUID()}`,
        status: complete ? "complete" : "incomplete",
        result: { complete, missing_fields, confidence, supporting_factors, risk_factors, correlation_ids },
      });

      return {
        complete,
        missing_fields,
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
      };
    } catch (e) {
      throw new Error(`assess_completeness failed: ${(e as Error).message}`);
    }
  },
};

export default completenessTool;
