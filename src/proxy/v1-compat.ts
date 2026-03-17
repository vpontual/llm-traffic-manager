// OpenAI /v1/chat/completions <-> Ollama native /api/chat conversion.
// Triggered when a /v1 request contains Ollama-specific fields (think, options)
// that the OpenAI-compatible endpoint ignores. The proxy rewrites the request
// to /api/chat and converts the response back to OpenAI format.

import { Transform, type TransformCallback } from "node:stream";

interface ParsedV1Body {
  model?: string;
  messages?: unknown[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  stop?: unknown;
  stream?: boolean;
  tools?: unknown[];
  think?: boolean;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConversionContext {
  model: string;
  isStreaming: boolean;
}

/**
 * Check if a /v1/chat/completions body needs native /api/chat conversion.
 * Returns the parsed body if conversion is needed, null otherwise.
 */
export function detectNativeConversion(body: Buffer): { parsed: ParsedV1Body; ctx: ConversionContext } | null {
  try {
    const parsed: ParsedV1Body = JSON.parse(body.toString());
    if (parsed.think !== undefined || parsed.options !== undefined) {
      return {
        parsed,
        ctx: {
          model: (parsed.model as string) ?? "",
          isStreaming: parsed.stream !== false,
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert OpenAI /v1/chat/completions request body to Ollama /api/chat format.
 */
export function convertRequestToNative(parsed: ParsedV1Body): Buffer {
  const native: Record<string, unknown> = {
    model: parsed.model,
    messages: parsed.messages,
    stream: parsed.stream ?? true,
  };

  if (parsed.think !== undefined) native.think = parsed.think;
  if (parsed.tools) native.tools = parsed.tools;
  if (parsed.stop !== undefined) native.stop = parsed.stop;

  // Merge OpenAI params into Ollama options
  const options: Record<string, unknown> = {
    ...(typeof parsed.options === "object" && parsed.options !== null
      ? (parsed.options as Record<string, unknown>)
      : {}),
  };
  if (parsed.temperature !== undefined) options.temperature = parsed.temperature;
  if (parsed.top_p !== undefined) options.top_p = parsed.top_p;
  if (parsed.max_tokens !== undefined) options.num_predict = parsed.max_tokens;
  if (parsed.frequency_penalty !== undefined) options.frequency_penalty = parsed.frequency_penalty;
  if (parsed.presence_penalty !== undefined) options.presence_penalty = parsed.presence_penalty;
  if (parsed.seed !== undefined) options.seed = parsed.seed;

  if (Object.keys(options).length > 0) native.options = options;

  return Buffer.from(JSON.stringify(native));
}

/**
 * Convert Ollama tool_calls to OpenAI format (arguments as JSON string, with id/type).
 */
function convertToolCalls(toolCalls: unknown[]): unknown[] {
  return toolCalls.map((tc: any, i: number) => ({
    id: `call_${Date.now()}_${i}`,
    type: "function",
    function: {
      name: tc.function.name,
      arguments:
        typeof tc.function.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments),
    },
  }));
}

/**
 * Convert a non-streaming Ollama /api/chat response to OpenAI format.
 */
export function convertResponseToV1(responseBody: Buffer, model: string): Buffer {
  try {
    const native = JSON.parse(responseBody.toString());
    const message = native.message ?? { role: "assistant", content: "" };

    if (message.tool_calls) {
      message.tool_calls = convertToolCalls(message.tool_calls);
    }

    // Remove Ollama-specific reasoning field so it does not leak into content
    delete message.reasoning;

    const v1 = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: native.model ?? model,
      system_fingerprint: `fp_ollama`,
      choices: [
        {
          index: 0,
          message,
          finish_reason: message.tool_calls ? "tool_calls" : (native.done_reason ?? "stop"),
        },
      ],
      usage: {
        prompt_tokens: native.prompt_eval_count ?? 0,
        completion_tokens: native.eval_count ?? 0,
        total_tokens: (native.prompt_eval_count ?? 0) + (native.eval_count ?? 0),
      },
    };
    return Buffer.from(JSON.stringify(v1));
  } catch {
    return responseBody;
  }
}

/**
 * Create a Transform stream that converts Ollama streaming /api/chat to OpenAI SSE.
 *
 * Ollama sends newline-delimited JSON:
 *   {"model":"x","message":{"role":"assistant","content":"H"},"done":false}\n
 *
 * OpenAI expects SSE:
 *   data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"content":"H"}}]}\n\n
 */
export function createV1StreamTransform(model: string): Transform {
  const chatId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  let buffer = "";
  let sentRole = false;

  return new Transform({
    transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const native = JSON.parse(line);
          if (native.done) {
            // Final chunk
            const final_chunk = {
              id: chatId,
              object: "chat.completion.chunk",
              created,
              model: native.model ?? model,
              system_fingerprint: "fp_ollama",
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: native.message?.tool_calls ? "tool_calls" : "stop",
                },
              ],
              usage: {
                prompt_tokens: native.prompt_eval_count ?? 0,
                completion_tokens: native.eval_count ?? 0,
                total_tokens:
                  (native.prompt_eval_count ?? 0) + (native.eval_count ?? 0),
              },
            };
            this.push(`data: ${JSON.stringify(final_chunk)}\n\n`);
            this.push("data: [DONE]\n\n");
          } else {
            const msg = native.message ?? {};
            const delta: Record<string, unknown> = {};
            if (!sentRole && msg.role) {
              delta.role = msg.role;
              sentRole = true;
            }
            if (msg.content) delta.content = msg.content;
            if (msg.tool_calls) {
              delta.tool_calls = convertToolCalls(msg.tool_calls);
            }
            // Skip chunks with empty delta (e.g. reasoning-only chunks)
            if (Object.keys(delta).length === 0) {
              callback();
              return;
            }

            const chunk_data = {
              id: chatId,
              object: "chat.completion.chunk",
              created,
              model: native.model ?? model,
              system_fingerprint: "fp_ollama",
              choices: [{ index: 0, delta, finish_reason: null }],
            };
            this.push(`data: ${JSON.stringify(chunk_data)}\n\n`);
          }
        } catch {
          // Skip unparseable lines
        }
      }
      callback();
    },

    flush(callback: TransformCallback) {
      if (buffer.trim()) {
        try {
          const native = JSON.parse(buffer);
          if (native.done) {
            this.push("data: [DONE]\n\n");
          }
        } catch {
          // Ignore
        }
      }
      callback();
    },
  });
}
