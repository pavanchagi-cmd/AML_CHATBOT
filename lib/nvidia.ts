import { config } from "@/lib/env";

// Carries the HTTP status so lib/retry.ts and the chat route can recognise 429 / 5xx.
export class LlmHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LlmHttpError";
  }
}

const MAX_ANSWER_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 55_000; // the chat route allows 60 s

function requestBody(prompt: string, system: string, stream: boolean, maxTokens: number) {
  return {
    model: config.nvidiaChatModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    stream,
    // Reasoning off: faster, and no thinking tokens eat the answer budget.
    chat_template_kwargs: { enable_thinking: false },
  };
}

async function post(body: object): Promise<Response> {
  const res = await fetch(`${config.nvidiaBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.nvidiaApiKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmHttpError(res.status, `Chat model returned HTTP ${res.status}. ${detail}`);
  }
  return res;
}

// Streams answer text from the chat model (OpenAI-compatible server-sent events).
export async function* generateStream(prompt: string, system: string): AsyncGenerator<string> {
  const res = await post(requestBody(prompt, system, true, MAX_ANSWER_TOKENS));
  if (!res.body) throw new Error("The chat model returned no response body.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let text: unknown;
        try {
          text = JSON.parse(data).choices?.[0]?.delta?.content;
        } catch {
          continue;
        }
        if (typeof text === "string" && text) yield text;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// For the admin Setup check: one tiny request to prove the key and model work.
export async function pingChatModel(): Promise<string> {
  const res = await post(requestBody("Reply with the word OK.", "You are a health check.", false, 16));
  await res.text();
  return `Model ${config.nvidiaChatModel()} answered.`;
}
