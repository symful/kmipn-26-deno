import { z } from "zod";
import { assessWithVision } from "@/lib/agent/vision";
import type { Env } from "@/types/bindings";
import type { ToolDescriptor } from "@/lib/agent/llm";

export const analyzeImageVisionInputSchema = z.object({
  image_source: z.string(),
  prompt: z.string(),
});

export const analyzeImageVisionOutputSchema = z.object({
  description: z.string(),
});

export type AnalyzeImageVisionInput = z.infer<typeof analyzeImageVisionInputSchema>;
export type AnalyzeImageVisionOutput = z.infer<typeof analyzeImageVisionOutputSchema>;

const analyzeImageVisionToolDescriptor: ToolDescriptor = {
  name: "analyze_image_vision",
  model: "vision",
  promptBuilder: (input: unknown): string => {
    const typedInput = input as AnalyzeImageVisionInput;
    return `Analyze the image at the provided URL.

Image URL: ${typedInput.image_source}
Analysis request: ${typedInput.prompt}

Return a JSON with:
- description (string): detailed description of what you see

Return ONLY valid JSON without markdown or additional text.`;
  },
  outputSchema: analyzeImageVisionOutputSchema,
};

const analyzeImageVisionTool = {
  ...analyzeImageVisionToolDescriptor,

  execute: async (env: Env, input: AnalyzeImageVisionInput): Promise<AnalyzeImageVisionOutput> => {
    try {
      const result = await assessWithVision(env, input.image_source, { description: input.prompt, category_name: "general" });
      return {
        description: result.description ?? "",
      };
    } catch (error) {
      // Return error shape - the loop will catch this via Promise.allSettled
      throw new Error(`Vision analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

export default analyzeImageVisionTool;
