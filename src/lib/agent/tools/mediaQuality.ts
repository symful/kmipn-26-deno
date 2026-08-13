import { z } from "zod";
import { callLLM } from "@/lib/agent/llm";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";

export const mediaQualityInputSchema = z.object({
  report_id: z.string().uuid(),
  image_url: z.string().url(),
  category_name: z.string(),
  description: z.string(),
});

export const mediaQualityOutputSchema = z.object({
  quality_ok: z.boolean(),
  blur_score: z.number().min(0).max(1),
  exposure_ok: z.boolean(),
  resolution_ok: z.boolean(),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
});

export type MediaQualityInput = z.infer<typeof mediaQualityInputSchema>;
export type MediaQualityOutput = z.infer<typeof mediaQualityOutputSchema>;

const mediaQualityToolDescriptor: ToolDescriptor = {
  name: "assess_media_quality",
  model: "vision",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as MediaQualityInput;
    return `Analisis kualitas foto infrastruktur desa.
Kategori: ${typedInput.category_name}
Deskripsi pelaporan: ${typedInput.description}

Evaluasi kualitas foto dan berikan JSON dengan field:
- quality_ok (boolean, true jika kualitas memadai)
- blur_score (float 0-1, dimana 0 = sangat buram, 1 = sangat tajam)
- exposure_ok (boolean, true jika pencahayaan memadai)
- resolution_ok (boolean, true jika resolusi cukup untuk analisis)
- confidence (0-1, tingkat kepercayaan penilaian)
- supporting_factors (array string, faktor yang mendukung kualitas baik)
- risk_factors (array string, faktor yang menurunkan kualitas)
- correlation_ids (array string, kosong jika tidak ada)

Kembalikan hanya JSON valid tanpa markdown atau teks tambahan.`;
  },
  outputSchema: mediaQualityOutputSchema,
};

const mediaQualityTool = {
  ...mediaQualityToolDescriptor,

  execute: async (env: Env, input: MediaQualityInput): Promise<MediaQualityOutput> => {
    try {
      const llmResult = await callLLM(env, {
        tool: mediaQualityToolDescriptor,
        input,
      }) as MediaQualityOutput;

      const { quality_ok, blur_score, exposure_ok, resolution_ok, confidence } = llmResult;
      const supporting_factors = llmResult.supporting_factors ?? [];
      const risk_factors = llmResult.risk_factors ?? [];
      const correlation_ids = llmResult.correlation_ids ?? [input.report_id];

      await saveAssessment(env, {
        tool_name: "assess_media_quality",
        report_id: input.report_id,
        model_version: env.VISION_MODEL_NAME ?? "MiniMax-M3",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        idempotency_key: `assess_media_quality_${input.report_id}_${crypto.randomUUID()}`,
        status: "completed",
        result: llmResult,
      });

      return llmResult;
    } catch (e) {
      throw new Error(`assess_media_quality failed: ${(e as Error).message}`);
    }
  },
};

export default mediaQualityTool;
