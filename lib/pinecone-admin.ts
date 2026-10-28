import { config } from "@/lib/env";
import { pinecone } from "@/lib/pinecone";

export type IndexState =
  | { state: "missing"; name: string }
  | { state: "wrong-shape"; name: string; message: string }
  | { state: "ready"; name: string; dimension: number };

export async function inspectIndex(): Promise<IndexState> {
  const name = config.pineconeIndex();
  const indexes = (await pinecone().indexes.list()).indexes ?? [];
  if (!indexes.some((i) => i.name === name)) return { state: "missing", name };
  const model = await pinecone().indexes.describe(name);
  const field = model.schema.fields["_values"];
  if (!field || !("type" in field) || field.type !== "dense_vector") {
    return { state: "wrong-shape", name, message: `Index "${name}" is not a dense vector index.` };
  }
  if (field.dimension !== config.embedDim() || field.metric !== "cosine") {
    return {
      state: "wrong-shape",
      name,
      message: `Index "${name}" has dimension ${field.dimension} and metric ${field.metric}; it needs ${config.embedDim()} and cosine.`,
    };
  }
  return { state: "ready", name, dimension: field.dimension };
}

// Creates the serverless index (one dense vector field, EMBED_DIM dimensions, cosine) if it doesn't exist.
export async function ensureIndex(cloud: string, region: string): Promise<string> {
  const current = await inspectIndex();
  if (current.state === "ready") return `Index "${current.name}" already exists. Nothing to do.`;
  if (current.state === "wrong-shape") throw new Error(`${current.message} Use another PINECONE_INDEX or recreate it.`);
  await pinecone().indexes.create({
    name: current.name,
    // A schema with only the reserved `_values` field gives a classic vector index (upsert, query, list by prefix).
    schema: { fields: { _values: { type: "dense_vector", dimension: config.embedDim(), metric: "cosine" } } },
    deployment: { deploymentType: "managed", cloud, region },
    waitUntilReady: true,
    timeout: 4 * 60 * 1000,
  });
  return `Index "${current.name}" created in ${cloud} ${region} and ready.`;
}
