import type { MininodeConfig } from './config.ts';

export type AiModel = 'gemini-flash' | 'gemini-pro' | 'claude-haiku' | 'claude-sonnet';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatOptions {
  model?: AiModel;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

type TokenSource = () => Promise<string | null>;

export function createAi(config: MininodeConfig, token: TokenSource) {
  const post = async (path: string, body: unknown, signal?: AbortSignal) => {
    const accessToken = await token();
    if (!accessToken) throw new AiError('Not signed in', 'unauthenticated', 401);
    const response = await fetch(new URL(path, config.aiUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: config.appSlug, ...(body as object) }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new AiError(problem.message ?? response.statusText, problem.error ?? 'error', response.status);
    }
    return response;
  };

  const toRequest = (messages: AiMessage[] | string, options: AiChatOptions) => ({
    messages: typeof messages === 'string' ? [{ role: 'user', content: messages }] : messages,
    model: options.model,
    system: options.system,
    maxOutputTokens: options.maxOutputTokens,
    temperature: options.temperature,
  });

  return {
    /** Returns the full answer text. */
    async chat(messages: AiMessage[] | string, options: AiChatOptions = {}): Promise<string> {
      const response = await post('/v1/chat', toRequest(messages, options), options.signal);
      const data = (await response.json()) as { text: string };
      return data.text;
    },

    /** Streams the answer; yields text deltas as they arrive. */
    async *stream(messages: AiMessage[] | string, options: AiChatOptions = {}): AsyncGenerator<string> {
      const response = await post(
        '/v1/chat',
        { ...toRequest(messages, options), stream: true },
        options.signal,
      );
      if (!response.body) return;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    },

    /** Asks for JSON matching `schema` (a JSON Schema object) and returns the parsed value. */
    async json<T>(prompt: string, schema: object, options: AiChatOptions = {}): Promise<T> {
      const response = await post(
        '/v1/json',
        { ...toRequest(prompt, options), schema },
        options.signal,
      );
      const data = (await response.json()) as { json: T };
      return data.json;
    },
  };
}
