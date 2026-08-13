import { z } from "zod";
import { callLLM } from "@/lib/agent/llm";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";

export const privacyRiskInputSchema = z.object({
  report_id: z.string().uuid(),
  description: z.string(),
  photo_urls: z.array(z.string().url()),
});

export const privacyRiskOutputSchema = z.object({
  pii_detected: z.boolean(),
  pii_types: z.array(z.string()),
  redaction_needed: z.boolean(),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
  status: z.enum(["scanned", "no_risk", "risk_detected", "error"]),
});

export type PrivacyRiskInput = z.infer<typeof privacyRiskInputSchema>;
export type PrivacyRiskOutput = z.infer<typeof privacyRiskOutputSchema>;

// Text input schema - only description
export const privacyRiskTextInputSchema = z.object({
  description: z.string(),
});

// Vision input schema - reportId and photoUrls array
export const privacyRiskVisionInputSchema = z.object({
  report_id: z.string().uuid(),
  photo_urls: z.array(z.string().url()),
});

export type PrivacyRiskTextInput = z.infer<typeof privacyRiskTextInputSchema>;
export type PrivacyRiskVisionInput = z.infer<typeof privacyRiskVisionInputSchema>;

export const privacyRiskTextDescriptor: ToolDescriptor = {
  name: "detect_privacy_risk_text",
  model: "text",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as PrivacyRiskTextInput;
    return `Analisis risiko privasi dari deskripsi laporan berikut:

Deskripsi: ${typedInput.description}

Evaluasi dan berikan JSON dengan field:
- pii_detected (boolean, apakah ada PII terdeteksi)
- pii_types (array string, contoh: ["face", "license_plate", "address", "document"])
- redaction_needed (boolean, apakah redaksi diperlukan)
- confidence (0-1, tingkat kepercayaan)
- supporting_factors (array string, faktor yang mendukung tidak ada risiko)
- risk_factors (array string, faktor risiko yang ditemukan)
- correlation_ids (array string, ID korelasi jika ada)

Kembalikan hanya JSON valid tanpa markdown atau teks tambahan.`;
  },
  outputSchema: privacyRiskOutputSchema,
};

export const privacyRiskVisionDescriptor: ToolDescriptor = {
  name: "detect_privacy_risk_vision",
  model: "vision",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as PrivacyRiskVisionInput;
    return `Analisis foto-foto berikut untuk risiko privasi.

Report ID: ${typedInput.report_id}
Jumlah foto: ${typedInput.photo_urls.length}

Evaluasi dan berikan JSON dengan field:
- pii_detected (boolean, apakah ada PII terdeteksi)
- pii_types (array string, contoh: ["face", "license_plate", "address", "document"])
- redaction_needed (boolean, apakah redaksi diperlukan)
- confidence (0-1, tingkat kepercayaan)
- supporting_factors (array string, faktor yang mendukung tidak ada risiko)
- risk_factors (array string, faktor risiko yang ditemukan)
- correlation_ids (array string, ID korelasi jika ada)

Kembalikan hanya JSON valid tanpa markdown atau teks tambahan.`;
  },
  outputSchema: privacyRiskOutputSchema,
};

const privacyRiskTool = {
  name: "detect_privacy_risk",
  description: "Detects privacy risks in report description and images using both text and vision models. Combines results for comprehensive assessment.",
  model: null as "text" | "vision" | null,
  inputSchema: privacyRiskInputSchema,
  outputSchema: privacyRiskOutputSchema,

  promptBuilder: (): string => {
    return "This tool uses both text and vision models - see execute method";
  },

  execute: async (env: Env, input: PrivacyRiskInput): Promise<PrivacyRiskOutput> => {
    try {
      const textResult = await callLLM(env, { tool: privacyRiskTextDescriptor, input: { description: input.description } });
      const textData = textResult as PrivacyRiskOutput;

      const visionResults = await Promise.all(
        input.photo_urls.map(photo_url =>
          callLLM(env, { tool: privacyRiskVisionDescriptor, input: { report_id: input.report_id, photo_urls: [photo_url] } })
        )
      );

      const allVisionData = visionResults as PrivacyRiskOutput[];
      let pii_detected = false;
      let redaction_needed = false;
      let confidence = textData.confidence;
      const allPiiTypes: string[] = [];
      const allSupportingFactors: string[] = [];
      const allRiskFactors: string[] = [];
      const allCorrelationIds: string[] = [];

      for (const visionData of allVisionData) {
        pii_detected = pii_detected || visionData.pii_detected;
        redaction_needed = redaction_needed || visionData.redaction_needed;
        confidence = Math.max(confidence, visionData.confidence);
        allPiiTypes.push(...visionData.pii_types);
        allSupportingFactors.push(...visionData.supporting_factors);
        allRiskFactors.push(...visionData.risk_factors);
        allCorrelationIds.push(...visionData.correlation_ids);
      }

      const pii_types = [...new Set([...textData.pii_types, ...allPiiTypes])];
      const supporting_factors = [...new Set([...textData.supporting_factors, ...allSupportingFactors])];
      const risk_factors = [...new Set([...textData.risk_factors, ...allRiskFactors])];
      const correlation_ids = [...new Set([...textData.correlation_ids, ...allCorrelationIds])];

      const status = pii_detected ? "risk_detected" : "no_risk";

      const result: PrivacyRiskOutput = {
        pii_detected,
        pii_types,
        redaction_needed,
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        status,
      };

      await saveAssessment(env, {
        tool_name: "detect_privacy_risk",
        report_id: input.report_id,
        model_version: `${env.TEXT_MODEL_NAME ?? "MiniMax-M2.1"}+${env.VISION_MODEL_NAME ?? "MiniMax-M3"}`,
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        idempotency_key: `detect_privacy_risk_${input.report_id}_${crypto.randomUUID()}`,
        status: result.status,
        result,
      });

      return result;
    } catch (e) {
      throw new Error(`detect_privacy_risk failed: ${(e as Error).message}`);
    }
  },
};

export default privacyRiskTool;
