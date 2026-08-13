import type { Env } from "@/types/bindings";
import { getConfig } from "@/config/env";

function getAllowedHosts(env: Env): string[] {
  const config = getConfig(env as unknown as Record<string, string | undefined>);
  return (config.ALLOWED_IMAGE_HOSTS ?? "r2.cloudflarestorage.com,sigap.live,localhost").split(",");
}

export interface VisionAssessment {
  damage_detected: boolean;
  severity: "low" | "medium" | "high" | "unknown";
  confidence: number;
  description: string;
  vlm_error?: string;
}

export async function assessWithVision(env: Env, imageUrl: string, reportContext: { description: string; category_name: string }): Promise<VisionAssessment> {
  try {
    const u = new URL(imageUrl);
    const allowedHosts = getAllowedHosts(env);
    if (!allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) {
      return { damage_detected: false, severity: "unknown", confidence: 0, description: "", vlm_error: "host_not_allowed: " + u.hostname };
    }
    const prompt = `Analisis foto infrastruktur desa. Kategori: ${reportContext.category_name}. Deskripsi: ${reportContext.description}. Apakah foto menunjukkan kerusakan? Berikan JSON dengan field: damage_detected (boolean), severity (low/medium/high), confidence (0-1), description (string).`;
    const res = await fetch(`${env.LLM_API_URI}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.VISION_MODEL_NAME ?? "MiniMax-M3",
        messages: [
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ]},
        ],
        max_tokens: 500,
      }),
    });
    if (!res.ok) {
      return { damage_detected: false, severity: "unknown", confidence: 0, description: "", vlm_error: `http_${res.status}` };
    }
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { damage_detected: false, severity: "unknown", confidence: 0, description: content.slice(0, 200), vlm_error: "no_json_in_response" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as VisionAssessment;
    return {
      damage_detected: Boolean(parsed.damage_detected),
      severity: ["low", "medium", "high"].includes(parsed.severity) ? parsed.severity : "unknown",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      description: String(parsed.description ?? ""),
    };
  } catch (e) {
    return { damage_detected: false, severity: "unknown", confidence: 0, description: "", vlm_error: (e as Error).message };
  }
}
