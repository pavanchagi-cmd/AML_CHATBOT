// Creates the Pinecone index from PINECONE_INDEX if it doesn't exist:
// serverless, one dense vector field of EMBED_DIM dimensions, cosine metric.
// Usage: PINECONE_CLOUD=aws PINECONE_REGION=us-east-1 npm run pinecone:create-index
import "./load-env";
import { config } from "@/lib/env";
import { pinecone } from "@/lib/pinecone";

async function main() {
  const name = config.pineconeIndex();
  const dimension = config.embedDim();
  const pc = pinecone();

  const existing = (await pc.indexes.list()).indexes?.find((i) => i.name === name);
  if (existing) {
    const model = await pc.indexes.describe(name);
    const field = model.schema.fields["_values"];
    if (field && "type" in field && field.type === "dense_vector") {
      if (field.dimension !== dimension || field.metric !== "cosine") {
        throw new Error(
          `Index "${name}" exists but has dimension ${field.dimension} and metric ${field.metric}; ` +
            `the app needs dimension ${dimension} and metric cosine. Use another PINECONE_INDEX or recreate it.`,
        );
      }
      console.log(`Index "${name}" already exists (dimension ${dimension}, cosine). Nothing to do.`);
      return;
    }
    throw new Error(`Index "${name}" exists but is not a dense vector index. Use another PINECONE_INDEX.`);
  }

  const cloud = process.env.PINECONE_CLOUD?.trim();
  const region = process.env.PINECONE_REGION?.trim();
  if (!cloud || !region) {
    throw new Error(
      "Set PINECONE_CLOUD and PINECONE_REGION (for example aws and us-east-1) to choose where the index is created.",
    );
  }

  console.log(`Creating index "${name}" in ${cloud} ${region} (dimension ${dimension}, cosine)…`);
  await pc.indexes.create({
    name,
    // A schema with only the reserved `_values` field gives a classic vector index (upsert, query, list by prefix).
    schema: { fields: { _values: { type: "dense_vector", dimension, metric: "cosine" } } },
    deployment: { deploymentType: "managed", cloud, region },
    waitUntilReady: true,
    timeout: 5 * 60 * 1000,
  });
  console.log(`Index "${name}" is ready.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
