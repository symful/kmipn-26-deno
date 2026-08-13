import type { Env } from "@/types/bindings";
import { z } from "zod";
import type { ZodType } from "zod";
import { withClient } from "@/lib/db";
import { redactText } from "./redaction";
import { logger } from "@/lib/logger";
import { getConfig } from "@/config/env";

export const TEXT_MODEL_NAME = "MiniMax-M2.1";
export const VISION_MODEL_NAME = "MiniMax-M3";

export interface LLMCallFailedError {
  kind: "llm_call_failed";
  tool: string;
  attempts: number;
  message: string;
}

export interface ToolDescriptor {
  name: string;
  model: "text" | "vision" | "both" | null;
  promptBuilder: (input: unknown) => string;
  outputSchema: ZodType;
}

export interface CallLLMOpts {
  tool: ToolDescriptor;
  input: unknown;
}

interface AiCallLogParams {
  model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

async function logAiCall(env: Env, params: AiCallLogParams): Promise<void> {
  try {
    await withClient(env, async (client) => {
      await client.query(
        `INSERT INTO ai_call_log (model, input_tokens, output_tokens, latency_ms, request_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [params.model, params.tokens_in, params.tokens_out, params.latency_ms, crypto.randomUUID()]
      );
    });
  } catch (err) {
    logger.error({ route: "/api/agent", method: "POST", error: err instanceof Error ? err : new Error(String(err)), context: "ai_call_log_failed" });
  }
}

function isServerError(error: unknown): boolean {
  if (error instanceof Error) {
    const match = error.message.match(/HTTP ([5]\d{2})/);
    if (match) return true;
  }
  return false;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.includes("Timeout");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeLLMRequest(
  env: Env,
  model: string,
  messages: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>,
  toolNameForChoice: string | null,
  signal?: AbortSignal
): Promise<Response> {
  const requestBody: Record<string, unknown> = { model, messages };

  if (toolNameForChoice !== null) {
    requestBody.tool_choice = { type: "function", function: { name: toolNameForChoice } };
  }

  return fetch(`${env.LLM_API_URI}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal: signal ?? null,
  });
}

function parseLLMResponse(
  data: {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  },
  tool: ToolDescriptor,
  isVisionTool: boolean
): { parsed: unknown; tokens_in: number; tokens_out: number } {
  const tokens_in = data.usage?.prompt_tokens ?? 0;
  const tokens_out = data.usage?.completion_tokens ?? 0;

  if (isVisionTool) {
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No tool_calls in LLM response");
    return { parsed: tool.outputSchema.parse(JSON.parse(args)), tokens_in, tokens_out };
  } else {
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in LLM response");
    return { parsed: tool.outputSchema.parse(JSON.parse(content)), tokens_in, tokens_out };
  }
}

export async function callLLM(env: Env, opts: CallLLMOpts): Promise<unknown> {
  const config = getConfig(env as unknown as Record<string, string | undefined>);
  const timeoutMs = config.TOOL_TIMEOUT_MS;
  const maxRetries = config.MAX_RETRIES;

  const isVisionTool = opts.tool.model === "vision";
  const model = isVisionTool
    ? (env.VISION_MODEL_NAME ?? VISION_MODEL_NAME)
    : (env.TEXT_MODEL_NAME ?? TEXT_MODEL_NAME);

  const startTime = Date.now();
  const prompt = redactText(opts.tool.promptBuilder(opts.input));

  const messages = isVisionTool
    ? [
        { type: "text" as const, text: prompt },
        { type: "image_url" as const, image_url: { url: (opts.input as { image_url: string }).image_url } },
      ]
    : [{ type: "text" as const, text: prompt }];

  const toolNameForChoice: string | null = isVisionTool ? opts.tool.name : null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await makeLLMRequest(env, model, messages, toolNameForChoice, controller.signal);

      if (!res.ok) {
        throw new Error(`LLM call failed: HTTP ${res.status} ${await res.text()}`);
      }

      const data = await res.json() as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const latency_ms = Date.now() - startTime;
      const { parsed, tokens_in, tokens_out } = parseLLMResponse(data, opts.tool, isVisionTool);

      await logAiCall(env, { model, latency_ms, tokens_in, tokens_out });
      return parsed;
    } catch (e) {
      lastError = e;
      clearTimeout(timeout);

      if (!isServerError(e) && !isTimeoutError(e)) throw e;

      if (attempt <= maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }

  throw {
    kind: "llm_call_failed",
    tool: opts.tool.name,
    attempts: maxRetries + 1,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  } satisfies LLMCallFailedError;
}

interface OpenAIFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface OpenAITool {
  type: "function";
  function: OpenAIFunctionDefinition;
}

function toolDescriptorToOpenAI(tool: ToolDescriptor): OpenAITool {
  const schema = tool.outputSchema;
  const shape = (schema as unknown as { shape: () => Record<string, { type: string; description?: string }> }).shape();
  const parameters: Record<string, unknown> = {
    type: "object",
    properties: {} as Record<string, unknown>,
    required: [] as string[],
  };

  if (shape) {
    for (const [key, value] of Object.entries(shape)) {
      const prop = value as { type: string; description?: string; isOptional?: boolean };
      (parameters.properties as Record<string, unknown>)[key] = {
        type: prop.type,
        description: prop.description ?? "",
      };
      if (!prop.isOptional) {
        (parameters.required as string[]).push(key);
      }
    }
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: `Tool: ${tool.name}. ${tool.promptBuilder({}).slice(0, 500)}`,
      parameters,
    },
  };
}

export function buildOpenAIToolDefinitions(tools: Record<string, ToolDescriptor>): OpenAITool[] {
  return Object.values(tools)
    .filter((tool) => tool.model !== null)
    .map(toolDescriptorToOpenAI);
}

export interface LLMChatMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
}

export interface CallLLMWithMessagesOptions {
  messages: LLMChatMessage[];
  tools: OpenAITool[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
}

export interface LLMChatResponse {
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  message: {
    content: string | null;
    tool_calls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> | null;
  };
  usage: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Calls the LLM with a messages array and tools array.
 * Returns the raw chat completion response for the orchestrator to process.
 */
export async function callLLMWithMessages(
  env: Env,
  opts: CallLLMWithMessagesOptions
): Promise<LLMChatResponse> {
  const config = getConfig(env as unknown as Record<string, string | undefined>);
  const timeoutMs = config.TOOL_TIMEOUT_MS;
  const maxRetries = config.MAX_RETRIES;
  const model = env.TEXT_MODEL_NAME ?? TEXT_MODEL_NAME;
  const temperature = opts.temperature ?? 0;

  const requestBody: Record<string, unknown> = {
    model,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
    })),
    tools: opts.tools,
    temperature,
  };

  if (opts.toolChoice) {
    requestBody.tool_choice = opts.toolChoice;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const startTime = Date.now();
      const res = await fetch(`${env.LLM_API_URI}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`LLM call failed: HTTP ${res.status} ${await res.text()}`);
      }

      const data = await res.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
          };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const latency_ms = Date.now() - startTime;
      const tokens_in = data.usage?.prompt_tokens ?? 0;
      const tokens_out = data.usage?.completion_tokens ?? 0;

      await logAiCall(env, { model, latency_ms, tokens_in, tokens_out });

      const choice = data.choices?.[0];
      const finish_reason = (choice?.finish_reason as LLMChatResponse["finish_reason"]) ?? null;
      const message = choice?.message ?? { content: null, tool_calls: null };

      return {
        finish_reason,
        message: {
          content: message.content ?? null,
          tool_calls: message.tool_calls?.map((tc) => ({
            id: tc.id ?? "",
            type: "function" as const,
            function: {
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "{}",
            },
          })) ?? null,
        },
        usage: { prompt_tokens: tokens_in, completion_tokens: tokens_out },
      };
    } catch (e) {
      lastError = e;
      clearTimeout(timeout);

      if (!isServerError(e) && !isTimeoutError(e)) throw e;

      if (attempt <= maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }

  throw {
    kind: "llm_call_failed",
    tool: "callLLMWithMessages",
    attempts: maxRetries + 1,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  } satisfies LLMCallFailedError;
}
