import { z } from "zod";
import { callLLM } from "@/lib/agent/llm";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";

export const extractDamageInputSchema = z.object({
  report_id: z.string().uuid(),
  image_url: z.string().url(),
  category_name: z.string(),
  description: z.string(),
});

export const extractDamageOutputSchema = z.object({
  damage_visible: z.boolean(),
  damage_type: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
});

export type ExtractDamageInput = z.infer<typeof extractDamageInputSchema>;
export type ExtractDamageOutput = z.infer<typeof extractDamageOutputSchema>;

const extractDamageToolDescriptor: ToolDescriptor = {
  name: "extract_damage_indicators",
  model: "vision",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as ExtractDamageInput;
    return `Analisis foto infrastruktur desa untuk indikasi kerusakan.

Kategori: ${typedInput.category_name}
Deskripsi pelaporan: ${typedInput.description}

Identifikasi dan berikan JSON dengan field:
- damage_detected (boolean, apakah ada kerusakan terlihat)
- severity (low|medium|high|unknown)
- damage_types (array of strings, jenis kerusakan: crack|erosion|corrosion|breakage|flood|fire|other. Always return as an array, e.g. ["crack", "erosion"])
- affected_components (array string, komponen yang terdampak: bridge|road|building|drainage|water_system|electrical|other)
- confidence (0-1, kepercayaan terhadap assessment)
- description (string, deskripsi detail kerusakan yang terlihat)

Kembalikan hanya JSON valid tanpa markdown atau teks tambahan.`;
  },
  outputSchema: extractDamageOutputSchema,
};

const extractDamageTool = {
  ...extractDamageToolDescriptor,

  execute: async (env: Env, input: ExtractDamageInput): Promise<ExtractDamageOutput> => {
    try {
      const llmResult = await callLLM(env, {
        tool: extractDamageToolDescriptor,
        input,
      }) as {
        damage_detected: boolean;
        severity: "low" | "medium" | "high" | "unknown";
        damage_types: string[];
        affected_components: string[];
        confidence: number;
        description: string;
        vlm_error?: string;
        status: "detected" | "not_detected" | "error";
      };

      if (!Array.isArray(llmResult.damage_types)) { llmResult.damage_types = []; }

      const damage_visible = llmResult.damage_detected;
      const severity: "low" | "medium" | "high" = llmResult.severity === "unknown" ? "medium" : llmResult.severity;
      const damage_type = llmResult.damage_types?.[0] ?? "other";
      const confidence = llmResult.confidence;
      const correlation_ids = [input.report_id];

      const supporting_factors: string[] = [];
      if (!damage_visible) supporting_factors.push("no_damage_detected");

      const risk_factors: string[] = [];
      if (damage_visible) {
        risk_factors.push("damage_detected");
        risk_factors.push(`severity_${severity}`);
        risk_factors.push(`damage_type_${damage_type}`);
        llmResult.damage_types.forEach((dt) => risk_factors.push(`damage_type_${dt}`));
        llmResult.affected_components.forEach((ac) => risk_factors.push(`affected_${ac}`));
      }

      await saveAssessment(env, {
        tool_name: "extract_damage_indicators",
        report_id: input.report_id,
        model_version: env.VISION_MODEL_NAME ?? "MiniMax-M3",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        idempotency_key: `extract_damage_indicators_${input.report_id}_${crypto.randomUUID()}`,
        status: llmResult.vlm_error ? "vlm_error" : damage_visible ? "detected" : "not_detected",
        result: { damage_visible, damage_type, severity, confidence, supporting_factors, risk_factors, correlation_ids },
      });

      return {
        damage_visible,
        damage_type,
        severity,
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
      };
    } catch (e) {
      throw new Error(`extract_damage_indicators failed: ${(e as Error).message}`);
    }
  },
};

export default extractDamageTool;
