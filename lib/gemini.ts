import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/env";
import { withRetry, type RetryOptions } from "@/lib/retry";

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// Gemini accepts up to 100 texts per batch embedding request.
export const EMBED_BATCH_SIZE = 100;

let client: GoogleGenAI | undefined;
export function ai() {
  return (client ??= new GoogleGenAI({ apiKey: config.geminiApiKey() }));
}

// Only the full 3072-dimension output comes normalised, so smaller vectors are L2-normalised here.
export function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm === 0 ? v.slice() : v.map((x) => x / norm);
}

export type EmbedOptions = {
  // Document title; Gemini uses it only with RETRIEVAL_DOCUMENT.
  title?: string;
  onProgress?: (done: number, total: number) => void;
  retry?: RetryOptions;
};

export async function embed(texts: string[], taskType: EmbedTaskType, opts: EmbedOptions = {}): Promise<number[][]> {
  const model = config.geminiEmbedModel();
  const dim = config.embedDim();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await withRetry(
      () =>
        ai().models.embedContent({
          model,
          contents: batch,
          config: {
            taskType,
            outputDimensionality: dim,
            ...(taskType === "RETRIEVAL_DOCUMENT" && opts.title ? { title: opts.title } : {}),
          },
        }),
      opts.retry,
    );
    const embeddings = res.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(`Gemini returned ${embeddings.length} embeddings for ${batch.length} texts.`);
    }
    for (const e of embeddings) {
      if (!e.values || e.values.length !== dim) {
        throw new Error(`Gemini returned an embedding of ${e.values?.length ?? 0} dimensions; expected ${dim}.`);
      }
      out.push(l2normalize(e.values));
    }
    opts.onProgress?.(out.length, texts.length);
  }
  return out;
}

// Streams answer text from the chat model.
export async function* generateStream(prompt: string, system: string): AsyncGenerator<string> {
  const stream = await ai().models.generateContentStream({
    model: config.geminiChatModel(),
    contents: prompt,
    config: { systemInstruction: system, temperature: 0.2 },
  });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}
