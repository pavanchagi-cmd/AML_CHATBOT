// Ingests every file in /seed-docs, the same way an admin upload does (spec section 6).
//
//   npm run seed                              files at the top level get the "Other" category
//   npm run seed -- --category "FATF report"  files at the top level get this category
//
// Files inside a subfolder named after a category ("FATF report", "Indian AML rules",
// "Internal SOP", "Other") get that category. A file already in the library as "ready"
// with the same file name is skipped, so the script can be re-run.
import "./load-env";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { uploadBlob } from "@/lib/blob";
import { CATEGORIES, type Category } from "@/lib/categories";
import { db, schema } from "@/lib/db";
import { newDocumentId } from "@/lib/documents";
import { FILE_KINDS, MAX_UPLOAD_BYTES, fileKind, titleFromFileName } from "@/lib/files";
import { runIngestion } from "@/lib/ingest";

const SEED_DIR = path.join(process.cwd(), "seed-docs");

function categoryFlag(): Category {
  const i = process.argv.indexOf("--category");
  if (i < 0) return "Other";
  const value = process.argv[i + 1];
  if (!(CATEGORIES as readonly string[]).includes(value)) {
    throw new Error(`--category must be one of: ${CATEGORIES.join(", ")}`);
  }
  return value as Category;
}

async function filesToSeed(defaultCategory: Category) {
  const out: { file: string; category: Category }[] = [];
  for (const entry of await readdir(SEED_DIR, { withFileTypes: true })) {
    const full = path.join(SEED_DIR, entry.name);
    if (entry.isDirectory() && (CATEGORIES as readonly string[]).includes(entry.name)) {
      for (const sub of await readdir(full, { withFileTypes: true })) {
        if (sub.isFile() && fileKind(sub.name))
          out.push({ file: path.join(full, sub.name), category: entry.name as Category });
      }
    } else if (entry.isFile() && fileKind(entry.name)) {
      out.push({ file: full, category: defaultCategory });
    }
  }
  return out;
}

async function main() {
  const files = await filesToSeed(categoryFlag());
  if (files.length === 0) {
    console.log("No PDF, DOCX, TXT or MD files found in seed-docs/.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const { file, category } of files) {
    const fileName = path.basename(file);
    const label = `${fileName} (${category})`;

    const [existing] = await db()
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(and(eq(schema.documents.fileName, fileName), eq(schema.documents.status, "ready")));
    if (existing) {
      console.log(`- ${label}: already in the library, skipped`);
      continue;
    }

    const { size } = await stat(file);
    if (size > MAX_UPLOAD_BYTES) {
      console.log(`✗ ${label}: over 20 MB, split it into smaller files`);
      failed++;
      continue;
    }

    console.log(`• ${label}`);
    const kind = fileKind(fileName)!;
    const contentType = FILE_KINDS[kind][0];
    const blob = await uploadBlob(`documents/${fileName}`, await readFile(file), contentType);
    const [doc] = await db()
      .insert(schema.documents)
      .values({
        id: newDocumentId(),
        title: titleFromFileName(fileName),
        category,
        fileName,
        blobUrl: blob.url,
        mimeType: contentType,
        sizeBytes: size,
        status: "processing",
      })
      .returning();

    const result = await runIngestion(doc, (event) => {
      if ("stage" in event) console.log(`    ${event.message}`);
      else if (event.type === "error") console.log(`    ✗ ${event.message}`);
    });
    if (result) ok++;
    else failed++;
  }
  console.log(`\nDone: ${ok} ingested, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
