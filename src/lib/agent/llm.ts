import { sendProviderRequest } from "./provider";
import type { Env } from "@/types/bindings";
import { z } from "zod";
import type { ZodType } from "zod";
import { redactText } from "./redaction";
import { logger } from "@/lib/logger";
import { getConfig } from "@/config/env";

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
  inputSchema: ZodType;
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

async function logAiCall(_env: Env, _params: AiCallLogParams): Promise<void> {
  // ai_call_log table removed — cost tracking handled via agent_assessments.latency_ms
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

export function zodToOpenAIParameters(
  schema: ZodType,
): Record<string, unknown> {
  const root = zodToOpenAIProperty(schema, "$root");
  return {
    type: "object",
    properties: (root.properties ?? {}) as Record<string, unknown>,
    required: root.required ?? [],
  };
}

async function makeLLMRequest(
  env: Env,
  model: string,
  messages: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >,
  toolNameForChoice: string | null,
  signal?: AbortSignal,
  tool?: ToolDescriptor,
): Promise<Response> {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: messages }],
  };

  if (toolNameForChoice !== null && tool) {
    requestBody.tools = [
      {
        type: "function",
        function: {
          name: `${tool.name}_response`,
          description: `Structured ${tool.name} result`,
          parameters: zodToOpenAIParameters(tool.outputSchema),
        },
      },
    ];
    requestBody.tool_choice = {
      type: "function",
      function: { name: `${tool.name}_response` },
    };
  }

  if (model.startsWith("MiniMax-M3")) {
    requestBody.thinking = { type: "disabled" };
  }

  return sendProviderRequest(env, requestBody, signal);
}

function extractJsonPayload(text: string): string {
  let t = text.trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

function parseLLMResponse(
  data: {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  },
  tool: ToolDescriptor,
  _isVisionTool: boolean,
): { parsed: unknown; tokens_in: number; tokens_out: number } {
  const tokens_in = data.usage?.prompt_tokens ?? 0;
  const tokens_out = data.usage?.completion_tokens ?? 0;

  const expectedName = `${tool.name}_response`;
  const calls = data.choices?.[0]?.message?.tool_calls ?? [];
  const matched =
    calls.find((tc) => tc.function?.name === expectedName) ?? calls[0];
  if (matched?.function?.arguments) {
    return {
      parsed: tool.outputSchema.parse(
        JSON.parse(extractJsonPayload(matched.function.arguments)),
      ),
      tokens_in,
      tokens_out,
    };
  }
  const content = data.choices?.[0]?.message?.content;
  if (content)
    return {
      parsed: tool.outputSchema.parse(JSON.parse(extractJsonPayload(content))),
      tokens_in,
      tokens_out,
    };
  throw new Error("No tool_calls or content in LLM response");
}

export async function callLLM(env: Env, opts: CallLLMOpts): Promise<unknown> {
  const config = getConfig(
    env as unknown as Record<string, string | undefined>,
  );
  const timeoutMs = config.TOOL_TIMEOUT_MS;
  const maxRetries = config.MAX_RETRIES;

  const isVisionTool = opts.tool.model === "vision";
  const model = isVisionTool
    ? config.VISION_MODEL_NAME
    : config.TEXT_MODEL_NAME;

  const startTime = Date.now();
  const providerInput =
    opts.input && typeof opts.input === "object"
      ? Object.fromEntries(
          Object.entries(opts.input).map(([key, value]) => [
            key,
            ["description", "title", "notes"].includes(key) &&
            typeof value === "string"
              ? redactText(value)
              : value,
          ]),
        )
      : opts.input;
  // Redact report prose, not trusted instructions, field names, URLs, or correlation IDs.
  const prompt = opts.tool.promptBuilder(providerInput);
  const input = opts.input as { image_url?: string; photo_urls?: string[] };
  const photoUrls = input.image_url
    ? [input.image_url]
    : (input.photo_urls ?? []);
  const images = isVisionTool
    ? await Promise.all(
        photoUrls.map(async (url) => {
          const parsed = new URL(url, env.R2_PUBLIC_URL);
          const key = parsed.pathname.replace(/^\/(?:r2\/)?/, "");
          if (key.startsWith("reports/") && env.R2) {
            const image = await env.R2.get(key);
            if (image) {
              const bytes = new Uint8Array(await image.arrayBuffer());
              let binary = "";
              for (let offset = 0; offset < bytes.length; offset += 8192)
                binary += String.fromCharCode(
                  ...bytes.subarray(offset, offset + 8192),
                );
              return `data:${image.httpMetadata?.contentType ?? "image/jpeg"};base64,${btoa(binary)}`;
            }
          }
          return url;
        }),
      )
    : [];

  const messages = isVisionTool
    ? [
        { type: "text" as const, text: prompt },
        ...images.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
      ]
    : [{ type: "text" as const, text: prompt }];

  const toolNameForChoice: string | null = opts.tool.name;
  let lastError: unknown;
  const mutableMessages: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [...messages];

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await makeLLMRequest(
        env,
        model,
        mutableMessages,
        toolNameForChoice,
        controller.signal,
        opts.tool,
      );

      if (!res.ok) {
        throw new Error(
          `LLM call failed: HTTP ${res.status} ${await res.text()}`,
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const latency_ms = Date.now() - startTime;
      let parsedResult: {
        parsed: unknown;
        tokens_in: number;
        tokens_out: number;
      };
      try {
        parsedResult = parseLLMResponse(data, opts.tool, isVisionTool);
      } catch (parseErr) {
        if (attempt <= maxRetries) {
          const raw =
            data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
            data.choices?.[0]?.message?.content ??
            "";
          mutableMessages.push({
            type: "text",
            text: `Output sebelumnya tidak valid: ${String(parseErr instanceof Error ? parseErr.message : parseErr).slice(0, 500)}\nRaw output: ${raw.slice(0, 800)}\nPerbaiki dan balas HANYA JSON valid sesuai skema.`,
          });
          throw Object.assign(
            new Error(`parse_retryable: ${String(parseErr)}`),
            { retryableParse: true },
          );
        }
        throw parseErr;
      }

      await logAiCall(env, {
        model,
        latency_ms,
        tokens_in: parsedResult.tokens_in,
        tokens_out: parsedResult.tokens_out,
      });
      clearTimeout(timeout);
      return parsedResult.parsed;
    } catch (e) {
      lastError = e;
      clearTimeout(timeout);

      const retryableParse =
        (e as { retryableParse?: boolean }).retryableParse === true;
      if (!retryableParse && !isServerError(e) && !isTimeoutError(e)) throw e;

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

// Zod 3 stores object shapes as functions and array element schemas in _def.type.
type ZodTypeName =
  | "ZodString"
  | "ZodNumber"
  | "ZodBoolean"
  | "ZodEnum"
  | "ZodArray"
  | "ZodObject"
  | "ZodOptional"
  | "ZodNullable"
  | "ZodDefault";

interface ZodTypeDef {
  typeName: ZodTypeName;
  description?: string;
  isOptional?: boolean;
}

interface ZodEnumDef extends ZodTypeDef {
  typeName: "ZodEnum";
  values: string[];
}

interface ZodArrayDef extends ZodTypeDef {
  typeName: "ZodArray";
  type: { _def: ZodTypeDef };
}

interface ZodObjectDef extends ZodTypeDef {
  typeName: "ZodObject";
  shape: Record<string, unknown> | (() => Record<string, unknown>);
}

interface ZodOptionalDef extends ZodTypeDef {
  typeName: "ZodOptional";
  innerType: { _def: ZodTypeDef };
}

interface ZodNullableDef extends ZodTypeDef {
  typeName: "ZodNullable";
  innerType: { _def: ZodTypeDef };
}

interface ZodDefaultDef extends ZodTypeDef {
  typeName: "ZodDefault";
  innerType: { _def: ZodTypeDef };
}

interface OpenAIProperty {
  type: string | string[];
  description?: string;
  items?: OpenAIProperty;
  properties?: Record<string, OpenAIProperty>;
  required?: string[];
  enum?: string[];
}

// Warn-once set to avoid spamming console for unrecognised Zod types
const _unknownTypeWarned = new Set<string>();
function warnOnce(msg: string, key: string): void {
  if (!_unknownTypeWarned.has(key)) {
    _unknownTypeWarned.add(key);
    console.warn(msg);
  }
}

// Build OpenAI property, omitting description when undefined to satisfy exactOptionalPropertyTypes
function prop(
  type: string,
  description: string | undefined,
  extra?: Partial<OpenAIProperty>,
): OpenAIProperty {
  return description ? { type, description, ...extra } : { type, ...extra };
}

/**
 * Converts a Zod type to an OpenAI JSON schema property.
 *
 * Handles: ZodString, ZodNumber, ZodBoolean, ZodEnum,
 *          ZodArray, ZodObject, ZodOptional, ZodNullable, ZodDefault.
 * ZodOptional / ZodDefault â†’ required = false.
 * ZodNullable â†’ unwraps but keeps required as-is.
 * Unknown types â†’ fallback "string" (warns once, never throws).
 */
function zodToOpenAIProperty(zodType: unknown, key: string): OpenAIProperty {
  const def = (zodType as { _def: ZodTypeDef })._def;
  if (!def) {
    warnOnce(
      `[zodToOpenAI] Cannot read _def on field "${key}", falling back to string`,
      key,
    );
    return { type: "string" };
  }

  const description = def.description;
  const tn = def.typeName as ZodTypeName;

  switch (tn) {
    case "ZodString":
      return prop("string", description);

    case "ZodNumber":
      return prop("number", description);

    case "ZodBoolean":
      return prop("boolean", description);

    case "ZodEnum": {
      const eDef = def as ZodEnumDef;
      return prop("string", description, { enum: eDef.values });
    }

    case "ZodArray": {
      const aDef = def as ZodArrayDef;
      const inner = aDef.type;
      if (inner) {
        return prop("array", description, {
          items: zodToOpenAIProperty(inner, `${key}[items]`),
        });
      }
      return prop("array", description);
    }

    case "ZodObject": {
      const oDef = def as ZodObjectDef;
      const properties: Record<string, OpenAIProperty> = {};
      const required: string[] = [];
      const shape =
        typeof oDef.shape === "function" ? oDef.shape() : oDef.shape;
      if (shape) {
        for (const [k, v] of Object.entries(shape)) {
          const p = zodToOpenAIProperty(v, `${key}.${k}`);
          properties[k] = p;
          const vDef = (v as { _def: ZodTypeDef })._def;
          const isOptional =
            vDef?.typeName === "ZodOptional" || vDef?.typeName === "ZodDefault";
          if (!isOptional) {
            required.push(k);
          }
        }
      }
      return prop("object", description, { properties, required });
    }

    case "ZodOptional": {
      const oDef = def as ZodOptionalDef;
      return zodToOpenAIProperty(oDef.innerType, key);
    }

    case "ZodNullable": {
      const nDef = def as ZodNullableDef;
      const inner = zodToOpenAIProperty(nDef.innerType, key);
      return {
        ...inner,
        type: [
          ...(Array.isArray(inner.type) ? inner.type : [inner.type]),
          "null",
        ],
      };
    }

    case "ZodDefault": {
      const dDef = def as ZodDefaultDef;
      return zodToOpenAIProperty(dDef.innerType, key);
    }

    default:
      warnOnce(
        `[zodToOpenAI] Unknown Zod type "${tn}" on field "${key}", falling back to string`,
        key,
      );
      return prop("string", description);
  }
}

function toolDescriptorToOpenAI(tool: ToolDescriptor): OpenAITool {
  const rootProp = zodToOpenAIProperty(tool.inputSchema, "$root");
  const properties: Record<string, OpenAIProperty> = rootProp.properties ?? {};
  const required: string[] = rootProp.required ?? [];

  const parameters: Record<string, unknown> = {
    type: "object",
    properties: properties as Record<string, unknown>,
    required,
  };

  return {
    type: "function",
    function: {
      name: tool.name,
      description: `Tool: ${tool.name}. ${tool.promptBuilder({}).slice(0, 500)}`,
      parameters,
    },
  };
}

export function buildOpenAIToolDefinitions(
  tools: Record<string, ToolDescriptor>,
): OpenAITool[] {
  return Object.values(tools)
    .filter((tool) => tool.model !== null)
    .map(toolDescriptorToOpenAI);
}

export interface LLMChatMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface CallLLMWithMessagesOptions {
  messages: LLMChatMessage[];
  tools: OpenAITool[];
  toolChoice?:
    "auto" | "none" | { type: "function"; function: { name: string } };
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
  opts: CallLLMWithMessagesOptions,
): Promise<LLMChatResponse> {
  const config = getConfig(
    env as unknown as Record<string, string | undefined>,
  );
  const timeoutMs = config.TOOL_TIMEOUT_MS;
  const maxRetries = config.MAX_RETRIES;
  const model = config.TEXT_MODEL_NAME;
  const temperature = opts.temperature ?? 0;

  const requestBody: Record<string, unknown> = {
    model,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: m.content ?? "",
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
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
      const res = await sendProviderRequest(
        env,
        requestBody,
        controller.signal,
      );

      if (!res.ok) {
        throw new Error(
          `LLM call failed: HTTP ${res.status} ${await res.text()}`,
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
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
      const finish_reason =
        (choice?.finish_reason as LLMChatResponse["finish_reason"]) ?? null;
      const message = choice?.message ?? { content: null, tool_calls: null };

      return {
        finish_reason,
        message: {
          content: message.content ?? null,
          tool_calls:
            message.tool_calls?.map((tc) => ({
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
