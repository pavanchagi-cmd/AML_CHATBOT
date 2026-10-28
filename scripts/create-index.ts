// Creates the Pinecone index from PINECONE_INDEX if it doesn't exist:
// serverless, one dense vector field of EMBED_DIM dimensions, cosine metric.
// Usage: PINECONE_CLOUD=aws PINECONE_REGION=us-east-1 npm run pinecone:create-index
// (Admins can also do this from Library → Setup check.)
import "./load-env";
import { ensureIndex, inspectIndex } from "@/lib/pinecone-admin";

async function main() {
  const current = await inspectIndex();
  if (current.state === "ready") {
    console.log(`Index "${current.name}" already exists (dimension ${current.dimension}, cosine). Nothing to do.`);
    return;
  }
  if (current.state === "wrong-shape") throw new Error(current.message);
  const cloud = process.env.PINECONE_CLOUD?.trim();
  const region = process.env.PINECONE_REGION?.trim();
  if (!cloud || !region) {
    throw new Error(
      "Set PINECONE_CLOUD and PINECONE_REGION (for example aws and us-east-1) to choose where the index is created.",
    );
  }
  console.log(`Creating index "${current.name}" in ${cloud} ${region}…`);
  console.log(await ensureIndex(cloud, region));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
