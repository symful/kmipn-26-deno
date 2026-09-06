import type { Env } from "@/types/bindings";

export function chatCompletionsUrl(uri: string): string {
  const base = uri.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base.replace(/\/v1$/, "")}/v1/chat/completions`;
}

export function responsesUrl(uri: string): string {
  const base = uri
    .replace(/\/+$/, "")
    .replace(/\/(chat\/completions|responses)$/, "");
  return `${base.replace(/\/v1$/, "")}/v1/responses`;
}

type JsonObject = Record<string, any>;

export function toResponsesRequest(body: JsonObject): JsonObject {
  const input: JsonObject[] = [];
  for (const message of body.messages ?? []) {
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output:
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
      });
      continue;
    }
    if (message.content != null) {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.map((part: JsonObject) => {
              if (part.type === "image_url")
                return {
                  type: "input_image",
                  image_url: part.image_url.url,
                  ...(part.image_url.detail
                    ? { detail: part.image_url.detail }
                    : {}),
                };
              if (part.type === "text")
                return {
                  type:
                    message.role === "assistant" ? "output_text" : "input_text",
                  text: part.text,
                };
              return part;
            });
      input.push({ role: message.role, content });
    }
    for (const call of message.tool_calls ?? []) {
      input.push({
        type: "function_call",
        call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      });
    }
  }
  const request: JsonObject = { model: body.model, input, store: false };
  if (body.tools)
    request.tools = body.tools.map((tool: JsonObject) =>
      tool.type === "function"
        ? { type: "function", strict: false, ...tool.function }
        : tool,
    );
  if (body.tool_choice)
    request.tool_choice =
      typeof body.tool_choice === "object" &&
      body.tool_choice.type === "function"
        ? { type: "function", name: body.tool_choice.function.name }
        : body.tool_choice;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (maxTokens != null) request.max_output_tokens = maxTokens;
  if (body.parallel_tool_calls != null)
    request.parallel_tool_calls = body.parallel_tool_calls;
  // GPT reasoning models do not support arbitrary sampling temperature.
  return request;
}

export function fromResponsesResult(data: JsonObject): JsonObject {
  const text: string[] = [];
  const calls: JsonObject[] = [];
  for (const item of data.output ?? []) {
    if (item.type === "function_call")
      calls.push({
        id: item.call_id ?? item.id,
        type: "function",
        function: { name: item.name, arguments: item.arguments },
      });
    if (item.type === "message")
      for (const part of item.content ?? []) {
        if (part.type === "output_text") text.push(part.text);
      }
  }
  return {
    id: data.id,
    model: data.model,
    choices: [
      {
        message: {
          role: "assistant",
          content: text.join("") || data.output_text || null,
          ...(calls.length ? { tool_calls: calls } : {}),
        },
        finish_reason:
          data.status === "incomplete"
            ? "length"
            : calls.length
              ? "tool_calls"
              : "stop",
      },
    ],
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

export async function sendProviderRequest(
  env: Env,
  body: JsonObject,
  signal?: AbortSignal,
): Promise<Response> {
  const responses =
    body.model === "gpt-5.6-luna" || /\/responses\/?$/.test(env.LLM_API_URI);
  const response = await fetch(
    responses
      ? responsesUrl(env.LLM_API_URI)
      : chatCompletionsUrl(env.LLM_API_URI),
    {
      method: "POST",
      headers: providerHeaders(env, crypto.randomUUID()),
      body: JSON.stringify(responses ? toResponsesRequest(body) : body),
      signal: signal ?? null,
    },
  );
  if (!responses || !response.ok) return response;
  const data = (await response.json()) as JsonObject;
  if (data.error || (data.status && data.status !== "completed"))
    return Response.json(
      {
        error: data.error ?? {
          message: `Provider response ${data.status}`,
          details: data.incomplete_details,
        },
      },
      { status: 502 },
    );
  return Response.json(fromResponsesResult(data), { status: response.status });
}

export function providerHeaders(
  env: Env,
  sessionId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.LLM_API_KEY}`,
  };
  if (new URL(env.LLM_API_URI).hostname === "opencode.ai") {
    headers["User-Agent"] = "SIGAP-Civic-Assessment/0.1";
    headers["x-opencode-session"] = sessionId;
  }
  return headers;
}
