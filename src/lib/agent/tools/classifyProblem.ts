import { z } from "zod";
import { callLLM } from "@/lib/agent/llm";
import { saveAssessment } from "@/lib/agent/store";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";

export const classifyProblemInputSchema = z.object({
  report_id: z.string().uuid(),
  description: z.string(),
  category_name: z.string(),
});

export const classifyProblemOutputSchema = z.object({
  category: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
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

Berikan JSON dengan field:
- category (string, kategori utama masalah)
- subcategory (string|null, subkategori jika applicable)
- priority (low|medium|high|critical)
- keywords (array string, kata kunci terkait masalah)
- confidence (0-1, tingkat kepercayaan klasifikasi)

Kembalikan hanya JSON valid tanpa markdown atau teks tambahan.`;
  },
  outputSchema: classifyProblemOutputSchema,
};

const classifyProblemTool = {
  ...classifyProblemToolDescriptor,

  execute: async (env: Env, input: ClassifyProblemInput): Promise<ClassifyProblemOutput> => {
    try {
      const llmResult = await callLLM(env, {
        tool: classifyProblemToolDescriptor,
        input,
      }) as {
        category: string;
        subcategory: string | null;
        priority: "low" | "medium" | "high" | "critical";
        keywords: string[];
        confidence: number;
        status: "classified" | "uncertain" | "error";
      };

      const severity: "low" | "medium" | "high" = llmResult.priority === "critical" ? "high" : llmResult.priority;
      const confidence = llmResult.confidence;
      const correlation_ids = [input.report_id];

      const supporting_factors: string[] = [`category_${llmResult.category}`];
      if (llmResult.confidence >= 0.7) supporting_factors.push("high_classification_confidence");
      if (llmResult.keywords.length > 0) supporting_factors.push("has_keywords");

      const risk_factors: string[] = [];
      if (severity === "high") {
        risk_factors.push(`severity_high`);
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
        status: llmResult.status,
        result: { category: llmResult.category, severity, supporting_factors, risk_factors, correlation_ids },
      });

      return {
        category: llmResult.category,
        severity,
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
