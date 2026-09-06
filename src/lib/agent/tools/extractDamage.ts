import { z } from "zod";
import { callLLM } from "@/lib/agent/llm";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";
import { dbId } from "@/lib/schemas";

export const extractDamageInputSchema = z.object({
  report_id: dbId,
  image_url: z.string().url(),
  category_name: z.string(),
  description: z.string(),
});

export const extractDamageOutputSchema = z.object({
  damage_visible: z.boolean(),
  damage_type: z.string(),
  damage_label: z.string(),
  damage_description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  severity_label: z.string(),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
});

export type ExtractDamageInput = z.infer<typeof extractDamageInputSchema>;
export type ExtractDamageOutput = z.infer<typeof extractDamageOutputSchema>;

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  crack: "Retak struktural",
  structural_crack: "Retak struktural",
  pothole: "Lubang jalan",
  erosion: "Erosi",
  corrosion: "Korosi",
  breakage: "Patahan",
  flood: "Banjir",
  subsidence: "Pengendapan tanah",
  collapse: "Runtuhan",
  leakage: "Kebocoran",
  crack路面: "Retak permukaan",
  surface_damage: "Kerusakan permukaan",
  other: "Kerusakan lainnya",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "Parah",
  medium: "Sedang",
  low: "Ringan",
};

function mapDamageType(raw: string): string {
  const normalized = raw.toLowerCase().replace(/[\s-]/g, "_");
  if (DAMAGE_TYPE_LABELS[normalized]) return normalized;
  if (normalized.includes("crack") || normalized.includes("retak"))
    return "crack";
  if (normalized.includes("pothole") || normalized.includes("lubang"))
    return "pothole";
  if (normalized.includes("erosi") || normalized.includes("erosion"))
    return "erosion";
  if (normalized.includes("banjir") || normalized.includes("flood"))
    return "flood";
  if (normalized.includes("runtuh") || normalized.includes("collapse"))
    return "collapse";
  return normalized || "other";
}

function buildDamageDescription(
  damageType: string,
  severity: string,
  damageVisible: boolean,
): string {
  if (!damageVisible) return "Tidak ada kerusakan terlihat pada foto";
  const label = DAMAGE_TYPE_LABELS[damageType] ?? damageType;
  const sevLabel = SEVERITY_LABELS[severity] ?? severity;
  return `Kerusakan teridentifikasi: ${label} — Tingkat keparahan ${sevLabel}`;
}

const extractDamageToolDescriptor: ToolDescriptor = {
  name: "extract_damage_indicators",
  model: "vision",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as ExtractDamageInput;
    return `Analisis foto infrastruktur desa untuk indikasi kerusakan.

Kategori: ${typedInput.category_name}
Deskripsi pelaporan: ${typedInput.description}

Gunakan hanya bukti yang benar-benar terlihat pada foto. Semua label, deskripsi, bukti pendukung dan risiko harus dalam Bahasa Indonesia; kode damage_type dan severity tetap sesuai enum. Jangan mengarang ukuran, dampak penduduk, penyebab, ataupun kepastian struktur di luar yang tampak. Bedakan pengamatan foto dari klaim deskripsi pelapor.

Balas HANYA JSON valid (tanpa markdown, tanpa penjelasan) dengan struktur persis:
{"damage_visible": boolean, "damage_type": string, "damage_label": string, "damage_description": string, "severity": "low" | "medium" | "high", "severity_label": string, "confidence": number 0-1, "supporting_factors": string[], "risk_factors": string[], "correlation_ids": string[]}

Ketentuan field:
- damage_visible: true jika ada kerusakan terlihat pada foto
- damage_type: jenis kerusakan utama dalam Bahasa Inggris (crack, structural_crack, pothole, erosion, corrosion, breakage, flood, subsidence, collapse, leakage, surface_damage, other)
- damage_label, damage_description, severity_label: label dan deskripsi pengamatan dalam Bahasa Indonesia; jangan mengarang dimensi atau penyebab
- severity: tingkat keparahan ("low" | "medium" | "high")
- confidence: 0-1
- supporting_factors: array string bukti pendukung dari foto
- risk_factors: array string faktor risiko
- correlation_ids: array berisi report id "${typedInput.report_id}"`;
  },
  inputSchema: extractDamageInputSchema,
  outputSchema: extractDamageOutputSchema,
};

const extractDamageTool = {
  ...extractDamageToolDescriptor,

  execute: async (
    env: Env,
    input: ExtractDamageInput,
  ): Promise<ExtractDamageOutput> => {
    try {
      const llmResult = (await callLLM(env, {
        tool: extractDamageToolDescriptor,
        input,
      })) as {
        damage_visible: boolean;
        damage_type: string;
        damage_description: string;
        severity: "low" | "medium" | "high";
        confidence: number;
        supporting_factors: string[];
        risk_factors: string[];
        correlation_ids: string[];
      };

      const damage_visible = llmResult.damage_visible;
      const severity: "low" | "medium" | "high" = llmResult.severity;
      const raw_damage_type = llmResult.damage_type || "other";
      const damage_type = mapDamageType(raw_damage_type);
      const damage_label = DAMAGE_TYPE_LABELS[damage_type] ?? raw_damage_type;
      const severity_label = SEVERITY_LABELS[severity] ?? severity;
      const damage_description =
        llmResult.damage_description ||
        buildDamageDescription(damage_type, severity, damage_visible);
      const confidence = llmResult.confidence;
      const correlation_ids = [input.report_id];

      const supporting_factors: string[] = llmResult.supporting_factors ?? [];
      if (!damage_visible) supporting_factors.push("no_damage_detected");

      const risk_factors: string[] = llmResult.risk_factors ?? [];
      if (damage_visible) {
        risk_factors.push("damage_detected");
        risk_factors.push(`severity_${severity}`);
        risk_factors.push(`damage_type_${damage_type}`);
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
        status: "completed",
        result: {
          damage_visible,
          damage_type,
          damage_label,
          damage_description,
          severity,
          severity_label,
          confidence,
          supporting_factors,
          risk_factors,
          correlation_ids,
        },
      });

      return {
        damage_visible,
        damage_type,
        damage_label,
        damage_description,
        severity,
        severity_label,
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
      };
    } catch (e) {
      throw new Error(
        `extract_damage_indicators failed: ${(e as Error).message}`,
      );
    }
  },
};

export default extractDamageTool;
