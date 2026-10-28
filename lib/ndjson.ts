// Newline-delimited JSON streams: one JSON object per line.

export type Emit<T> = (event: T) => void;

// The work keeps running if the browser disconnects, so a document never stays half-processed.
export function ndjsonResponse<T>(run: (emit: Emit<T>) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit<T> = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await run(emit);
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // Already closed by a disconnect.
          }
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

// Browser side: calls onEvent for every complete line as it arrives.
export async function readNdjson<T>(res: Response, onEvent: (event: T) => void): Promise<void> {
  if (!res.body) throw new Error("Empty response.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as T);
    }
    if (done) break;
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as T);
}
