// Provider adapters. Both go through Cloudflare AI Gateway (logs, caching, rate limits).

import Anthropic from '@anthropic-ai/sdk';
import type { ModelEntry } from './models.ts';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: ModelEntry;
  system?: string | undefined;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number | undefined;
  /** JSON Schema: when set, the model must answer with matching JSON. */
  schema?: Record<string, unknown> | undefined;
  /** Let the model search the web (chat only; ADR 0024). */
  search?: boolean | undefined;
}

export interface Source {
  title: string;
  url: string;
}

export interface Usage {
  input: number;
  output: number;
}

export interface ChatResult {
  text: string;
  usage: Usage;
  /** Pages the answer relies on, when the model searched. */
  sources?: Source[];
}

export interface StreamResult {
  body: ReadableStream<Uint8Array>;
  usage: Promise<Usage>;
}

export interface Provider {
  complete(request: ChatRequest): Promise<ChatResult>;
  stream(request: ChatRequest): Promise<StreamResult>;
}

export interface ProviderKeys {
  gatewayBase: string;
  gatewayToken?: string | undefined;
  anthropicKey?: string | undefined;
  geminiKey?: string | undefined;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

function gatewayHeaders(keys: ProviderKeys): Record<string, string> {
  return keys.gatewayToken ? { 'cf-aig-authorization': `Bearer ${keys.gatewayToken}` } : {};
}

// ---------------------------------------------------------------------------
// Anthropic (official SDK, base URL pointed at the gateway)
// ---------------------------------------------------------------------------

export function anthropicProvider(keys: ProviderKeys): Provider {
  const client = new Anthropic({
    apiKey: keys.anthropicKey ?? 'gateway-byok',
    baseURL: `${keys.gatewayBase}/anthropic`,
    defaultHeaders: gatewayHeaders(keys),
    maxRetries: 1,
  });

  const params = (request: ChatRequest) => ({
    model: request.model.id,
    max_tokens: request.maxOutputTokens,
    messages: request.messages,
    ...(request.system ? { system: request.system } : {}),
    ...(request.schema
      ? { output_config: { format: { type: 'json_schema' as const, schema: request.schema } } }
      : {}),
    ...(request.search
      ? {
          tools: [
            { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 5 },
          ],
        }
      : {}),
  });

  const textOf = (message: Anthropic.Message) =>
    message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

  const sourcesOf = (message: Anthropic.Message): Source[] => {
    const found = new Map<string, Source>();
    for (const block of message.content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content))
        for (const hit of block.content)
          if (hit.type === 'web_search_result')
            found.set(hit.url, { title: hit.title, url: hit.url });
    }
    return [...found.values()];
  };

  const guard = (message: Anthropic.Message) => {
    if (message.stop_reason === 'refusal')
      throw new ProviderError('model declined the request', 422);
    // A search that did not finish would return a cut-off answer that looks complete.
    if (message.stop_reason === 'pause_turn')
      throw new ProviderError('the search did not finish', 502);
  };

  return {
    async complete(request) {
      try {
        const message = await client.messages.create(params(request));
        guard(message);
        const sources = sourcesOf(message);
        return {
          text: textOf(message),
          usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
          ...(sources.length ? { sources } : {}),
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error instanceof Anthropic.APIError)
          throw new ProviderError(error.message, error.status ?? 502);
        throw error;
      }
    },

    async stream(request) {
      const stream = client.messages.stream(params(request));
      const encoder = new TextEncoder();
      let resolveUsage: (usage: Usage) => void = () => {};
      let rejectUsage: (error: unknown) => void = () => {};
      const usage = new Promise<Usage>((resolve, reject) => {
        resolveUsage = resolve;
        rejectUsage = reject;
      });

      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          stream.on('text', (delta) => controller.enqueue(encoder.encode(delta)));
          stream
            .finalMessage()
            .then((message) => {
              resolveUsage({
                input: message.usage.input_tokens,
                output: message.usage.output_tokens,
              });
              controller.close();
            })
            .catch((error: unknown) => {
              rejectUsage(error);
              controller.error(error);
            });
        },
        cancel() {
          stream.abort();
        },
      });
      return { body, usage };
    },
  };
}

// ---------------------------------------------------------------------------
// Google Gemini (REST through the gateway's google-ai-studio route)
// ---------------------------------------------------------------------------

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

export function geminiProvider(keys: ProviderKeys, fetcher: typeof fetch = fetch): Provider {
  const url = (model: string, method: string) =>
    `${keys.gatewayBase}/google-ai-studio/v1beta/models/${encodeURIComponent(model)}:${method}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(keys.geminiKey ? { 'x-goog-api-key': keys.geminiKey } : {}),
    ...gatewayHeaders(keys),
  };

  const body = (request: ChatRequest) =>
    JSON.stringify({
      contents: request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      ...(request.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.schema
          ? { responseMimeType: 'application/json', responseJsonSchema: request.schema }
          : {}),
      },
    });

  const textOf = (data: GeminiResponse) =>
    (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
  const usageOf = (data: GeminiResponse): Usage => ({
    input: data.usageMetadata?.promptTokenCount ?? 0,
    // Thinking tokens are billed as output.
    output:
      (data.usageMetadata?.candidatesTokenCount ?? 0) +
      (data.usageMetadata?.thoughtsTokenCount ?? 0),
  });

  return {
    async complete(request) {
      const response = await fetcher(url(request.model.id, 'generateContent'), {
        method: 'POST',
        headers,
        body: body(request),
      });
      if (!response.ok) throw new ProviderError(await response.text(), response.status);
      const data = (await response.json()) as GeminiResponse;
      const sources = new Map<string, Source>();
      for (const chunk of data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
        if (chunk.web?.uri)
          sources.set(chunk.web.uri, {
            title: chunk.web.title ?? chunk.web.uri,
            url: chunk.web.uri,
          });
      return {
        text: textOf(data),
        usage: usageOf(data),
        ...(sources.size ? { sources: [...sources.values()] } : {}),
      };
    },

    async stream(request) {
      const response = await fetcher(`${url(request.model.id, 'streamGenerateContent')}?alt=sse`, {
        method: 'POST',
        headers,
        body: body(request),
      });
      if (!response.ok || !response.body) {
        throw new ProviderError(await response.text(), response.status);
      }

      let last: Usage = { input: 0, output: 0 };
      let resolveUsage: (usage: Usage) => void = () => {};
      const usage = new Promise<Usage>((resolve) => {
        resolveUsage = resolve;
      });
      const encoder = new TextEncoder();
      let buffer = '';

      const transform = new TransformStream<string, Uint8Array>({
        transform(chunk, controller) {
          buffer += chunk;
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const event of events) {
            const line = event.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const data = JSON.parse(line.slice(5)) as GeminiResponse;
            const text = textOf(data);
            if (text) controller.enqueue(encoder.encode(text));
            if (data.usageMetadata) last = usageOf(data);
          }
        },
        flush() {
          resolveUsage(last);
        },
      });

      return {
        body: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(transform),
        usage,
      };
    },
  };
}
