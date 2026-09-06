import { z } from "zod";
import { callLLM } from "@/lib/agent/llm";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";
import { dbId } from "@/lib/schemas";

export const classifyProblemInputSchema = z.object({
  report_id: dbId,
  description: z.string(),
  category_name: z.string(),
});

export const classifyProblemOutputSchema = z.object({
  category: z.string(),
  severity: z.enum(["low", "medium", "high", "unknown"]),
  confidence: z.number().min(0).max(1),
  severity_evidence: z.array(z.string()),
  supporting_factors: z.array(z.string()),
  risk_factors: z.array(z.string()),
  correlation_ids: z.array(z.string()),
});

export type ClassifyProblemInput = z.infer<typeof classifyProblemInputSchema>;
export type ClassifyProblemOutput = z.infer<typeof classifyProblemOutputSchema>;

const classifyProblemToolDescriptor: ToolDescriptor = {
  name: "classify_problem",
  model: "text",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as ClassifyProblemInput;
    return `Klasifikasikan masalah infrastruktur desa berdasarkan deskripsi berikut:

Kategori pelaporan: ${typedInput.category_name}
Deskripsi: ${typedInput.description}

Penilaian ini hanya berdasarkan teks, bukan inspeksi foto. Jika teks tidak cukup untuk menentukan keparahan, gunakan unknown; tidak adanya rincian bukan bukti kerusakan ringan. Semua kalimat bukti dan risiko harus Bahasa Indonesia, hanya berdasarkan teks yang tersedia.

Balas HANYA JSON valid (tanpa markdown, tanpa penjelasan) dengan struktur persis:
{"category": string, "severity": "low" | "medium" | "high" | "unknown", "confidence": number 0-1, "severity_evidence": string[], "supporting_factors": string[], "risk_factors": string[], "correlation_ids": string[]}

Ketentuan field:
- category: kategori utama masalah berdasarkan teks (Jalan, Jembatan, Air Bersih, Fasilitas Umum, Irigasi; jangan mengganti kategori tanpa bukti)
- severity: tingkat keparahan berdasarkan teks ("low" | "medium" | "high" | "unknown")
- severity_evidence: kutipan persis dari deskripsi yang menjelaskan kondisi atau dampak kerusakan. Jangan mengutip nama kategori atau kata pengujian sebagai bukti kerusakan. Jika tidak ada, isi [] dan severity unknown.
- Teks yang hanya menyatakan laporan uji coba/test tanpa kondisi kerusakan harus unknown. Low hanya jika teks menyatakan kerusakan ringan; bukan karena dampak tidak disebutkan.
- supporting_factors dan risk_factors: kalimat Bahasa Indonesia, tanpa kode mesin seperti category_air_bersih atau severity_high.
- confidence: keyakinan terhadap klasifikasi teks, bukan kepastian kerusakan; 0-1
- supporting_factors: array string bukti pendukung
- risk_factors: array string faktor risiko
- correlation_ids: array berisi report id "${typedInput.report_id}"`;
  },
  inputSchema: classifyProblemInputSchema,
  outputSchema: classifyProblemOutputSchema,
};

const classifyProblemTool = {
  ...classifyProblemToolDescriptor,

  execute: async (
    env: Env,
    input: ClassifyProblemInput,
  ): Promise<ClassifyProblemOutput> => {
    try {
      const llmResult = (await callLLM(env, {
        tool: classifyProblemToolDescriptor,
        input,
      })) as {
        category: string;
        severity: "low" | "medium" | "high" | "unknown";
        confidence: number;
        severity_evidence: string[];
        supporting_factors: string[];
        risk_factors: string[];
        correlation_ids: string[];
      };

      const severity_evidence = classificationEvidence(
        input,
        llmResult.severity_evidence,
      );
      const severity = groundedClassificationSeverity(
        llmResult.severity,
        severity_evidence,
      );
      const confidence = llmResult.confidence;
      const correlation_ids = [input.report_id];

      const supporting_factors = [...llmResult.supporting_factors];
      const risk_factors = [...llmResult.risk_factors];
      if (severity === "unknown" && severity_evidence.length === 0) {
        risk_factors.push(
          "Deskripsi belum memuat bukti yang cukup untuk menilai tingkat kerusakan.",
        );
      }

      await saveAssessment(env, {
        tool_name: "classify_problem",
        report_id: input.report_id,
        model_version: env.TEXT_MODEL_NAME ?? "MiniMax-M2.1",
        rule_version: "1.0.0",
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
        idempotency_key: `classify_problem_${input.report_id}_${crypto.randomUUID()}`,
        status: "completed",
        result: {
          category: llmResult.category,
          severity,
          severity_evidence,
          confidence,
          supporting_factors,
          risk_factors,
          correlation_ids,
        },
      });

      return {
        category: llmResult.category,
        severity,
        severity_evidence,
        confidence,
        supporting_factors,
        risk_factors,
        correlation_ids,
      };
    } catch (e) {
      throw new Error(`classify_problem failed: ${(e as Error).message}`);
    }
  },
};

export default classifyProblemTool;

export function groundedClassificationSeverity(
  severity: ClassifyProblemOutput["severity"],
  evidence: readonly string[],
): ClassifyProblemOutput["severity"] {
  return evidence.length === 0 ? "unknown" : severity;
}

export function classificationEvidence(
  input: Pick<ClassifyProblemInput, "description" | "category_name">,
  excerpts: readonly string[],
): string[] {
  return excerpts.filter((quote) => {
    const normalized = quote.trim().toLowerCase();
    return (
      normalized.length > 0 &&
      input.description.includes(quote) &&
      normalized !== input.category_name.trim().toLowerCase() &&
      !/^(?:test|tes|uji coba|pengujian|laporan(?: test| uji coba)?)[.! ]*$/.test(
        normalized,
      )
    );
  });
}
