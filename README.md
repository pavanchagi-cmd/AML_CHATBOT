# AML Compass

AML Compass is a training assistant for new L1/L2 AML analysts. Analysts ask questions about money-laundering patterns, red flags and procedures, and get answers drawn **only** from documents in the library (FATF reports, Indian AML rules, internal SOPs), with a citation for every point. Clicking a citation shows the exact passage and page.

If the library doesn't cover a question, the app says so instead of guessing, and logs the question as a training gap that trainers can review under **Insights**.

- **Ask:** chat with streamed, cited answers and a Sources panel showing the passages used.
- **Library:** admins upload PDF, DOCX, TXT or MD files (up to 20 MB). Each file is extracted, chunked, embedded and indexed, with live progress.
- **Insights:** questions asked, share answered from the library, not-found count, helpful rating, most-asked topics and gaps to review.

## How it works

| Layer         | Choice                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| App           | Next.js (App Router) on Vercel. UI and API routes in one app; every key stays on the server            |
| Answers       | Google Gemini chat model (`GEMINI_CHAT_MODEL`), streamed                                               |
| Embeddings    | Gemini `gemini-embedding-001`, 768 dimensions, L2-normalised                                           |
| Vector search | Pinecone serverless index, cosine, 768 dimensions                                                      |
| Chunking      | LangChain `RecursiveCharacterTextSplitter`, 1,000 characters with 150 overlap, split by headings first |
| Database      | Postgres on Neon (Drizzle ORM): documents, question log, feedback                                      |
| Files         | Vercel Blob, private. The browser uploads straight to Blob                                             |

**Ingestion:** upload to Blob → `POST /api/ingest` extracts text per page, chunks it, embeds the chunks in batches, upserts them to Pinecone and records the document in Postgres. Each stage is streamed to the progress bar. A document ends either **Ready** with all its vectors, or **Failed** with none.

**Answering:** `POST /api/chat` embeds the question, searches Pinecone (top 8, optional category filter) and keeps passages scoring at least `RAG_MIN_SCORE`. If none remain, Gemini is not called and the question is logged as not found. Otherwise Gemini answers from the numbered passages only and must cite them, and the answer streams back with its sources.

## Requirements

- Node.js 20.9 or later (22 recommended) and npm
- Accounts:
  - [Google AI Studio](https://aistudio.google.com) for the Gemini API key
  - [Pinecone](https://www.pinecone.io)
  - [Vercel](https://vercel.com), which also provides Neon Postgres and Vercel Blob through its Marketplace

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from the template and fill it in (see [Environment variables](#environment-variables)):

   ```bash
   cp .env.example .env.local
   ```

   If the Vercel project already exists, the [Vercel CLI](https://vercel.com/docs/cli) can download its variables instead: `vercel link`, then `vercel env pull .env.local`.

3. Create the Pinecone index (once per Pinecone project), run the database migrations, then start the app:

   ```bash
   npm run pinecone:create-index
   ```

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>. In **Library**, choose **Admin sign-in**, enter `ADMIN_PASSCODE` and upload a document.

`.env*` files are git-ignored (except `.env.example`). Never commit keys.

## Environment variables

| Variable                                   | Purpose                                                                                                           | Default                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `GEMINI_API_KEY`                           | Gemini API key from Google AI Studio                                                                              | required                          |
| `GEMINI_CHAT_MODEL`                        | Gemini chat model id (a current stable Flash model)                                                               | required                          |
| `GEMINI_EMBED_MODEL`                       | Embedding model                                                                                                   | `gemini-embedding-001`            |
| `EMBED_DIM`                                | Embedding dimensions (must match the Pinecone index)                                                              | `768`                             |
| `PINECONE_API_KEY`                         | Pinecone API key                                                                                                  | required                          |
| `PINECONE_INDEX`                           | Index name                                                                                                        | `aml-compass`                     |
| `PINECONE_NAMESPACE`                       | Namespace inside the index                                                                                        | `default`                         |
| `DATABASE_URL`                             | Neon Postgres connection string (set by the Vercel Neon integration)                                              | required                          |
| `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN` | Vercel Blob credentials, set when you connect a Blob store (new stores connect with OIDC and set `BLOB_STORE_ID`) | required                          |
| `ADMIN_PASSCODE`                           | Passcode for upload, delete and re-index                                                                          | required                          |
| `RAG_TOP_K`                                | Passages retrieved per question                                                                                   | `8`                               |
| `RAG_MIN_SCORE`                            | Minimum cosine score for a passage to count as relevant                                                           | `0.55` (tune with real documents) |
| `PINECONE_CLOUD`, `PINECONE_REGION`        | Where `pinecone:create-index` creates the index, e.g. `aws` and `us-east-1`                                       | only for that script              |

A missing required variable doesn't break the build. The request that needs it fails with "The app isn't fully set up yet", and the server log names the variable.

### Getting a Gemini API key

1. Sign in to [Google AI Studio](https://aistudio.google.com) with a Google account.
2. Create an API key there (AI Studio offers to create a Google Cloud project if you don't have one).
3. Put it in `GEMINI_API_KEY`. Check the [Gemini models page](https://ai.google.dev/gemini-api/docs/models) for the current stable Flash model id and put it in `GEMINI_CHAT_MODEL`.

Free-tier keys have low rate limits. Ingesting long reports may then pause and retry; the app backs off automatically on rate limits (429).

### Creating the Pinecone index

```bash
PINECONE_CLOUD=aws PINECONE_REGION=us-east-1 npm run pinecone:create-index
```

This creates a serverless index named `PINECONE_INDEX` with one dense vector field of `EMBED_DIM` (768) dimensions and the cosine metric, and waits until it's ready. If the index already exists, the script checks that its dimension and metric match and changes nothing. Choose the cloud and region that suit your data-residency needs.

## Setup check

In **Library**, choose **Admin sign-in**, enter `ADMIN_PASSCODE`, then **Run setup check**. It lists:

- every required setting, and whether it is set (secret values are never shown);
- the values in use for optional settings;
- whether the database (and its tables), the Pinecone index (with its dimension, metric and passage count), Gemini embeddings, the Gemini answer model and Vercel Blob respond. Problems come with the next step to take, for example "run npm run db:migrate".

Vercel applies new environment variables only to new deployments, so redeploy after changing them.

## Database migrations

The schema is in `lib/db/schema.ts`; generated SQL migrations are in `drizzle/`.

```bash
npm run db:migrate
```

This applies pending migrations to the database in `DATABASE_URL` (read from `.env.local`). For production, run it with the production `DATABASE_URL`: copy it from the Neon dashboard (or the project's Environment Variables in Vercel) into `.env.local`, run the migration, then restore your local value.

After changing `lib/db/schema.ts`, create a new migration and commit it:

```bash
npm run db:generate
```

## Seeding documents

Put files in `seed-docs/` (git-ignored, except the placeholder) and run:

```bash
npm run seed
```

- Files directly in `seed-docs/` get the category **Other**, or the one passed with `--category`:

  ```bash
  npm run seed -- --category "FATF report"
  ```

- Files in a subfolder named after a category get that category, for example `seed-docs/Internal SOP/pattern-sop.pdf` or `seed-docs/Indian AML rules/pml-rules.pdf`. The categories are `FATF report`, `Indian AML rules`, `Internal SOP` and `Other`.
- A file already in the library as Ready, with the same file name, is skipped, so the script can be re-run.

Seeding needs every service variable in `.env.local`, including the Blob credentials: `vercel env pull .env.local` brings `BLOB_STORE_ID` and a short-lived `VERCEL_OIDC_TOKEN` (pull again if it has expired), or set a `BLOB_READ_WRITE_TOKEN`. It runs locally with no time limit, which makes it the way to ingest very large reports that time out in the browser upload.

## Deploying to Vercel

1. In the Vercel dashboard, go to **Add New → Project**, import this GitHub repository and keep the **Next.js** framework preset. `vercel.json` also pins the framework.
2. In the project's **Storage** tab, add **Neon Postgres** (sets `DATABASE_URL`) and **Vercel Blob** (sets `BLOB_STORE_ID`; older stores set `BLOB_READ_WRITE_TOKEN`). Files are stored as private blobs and uploaded through short-lived presigned URLs.
3. In **Settings → Environment Variables**, add the remaining variables from the table above for Production, Preview and Development.
4. Create the Pinecone index and run the migrations against the production database (see above).
5. Deploy. Every push to `main` deploys to production; other branches and pull requests get preview URLs.

Ingestion routes set `maxDuration = 300` seconds (`app/api/ingest/route.ts`, `app/api/documents/[id]/reindex/route.ts`, and `lib/limits.ts`, which must stay in sync). If your Vercel plan allows longer functions, raising it helps with large PDFs.

## Scripts

| Script                                       | What it does                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`                                | Development server                                                                          |
| `npm run build` / `npm start`                | Production build / serve it                                                                 |
| `npm run lint`                               | ESLint                                                                                      |
| `npm run typecheck`                          | Next.js route types + TypeScript                                                            |
| `npm test`                                   | Unit and integration tests (Vitest; Postgres runs in memory via PGlite, no services needed) |
| `npm run test:e2e`                           | Playwright end-to-end tests (see below)                                                     |
| `npm run format`                             | Prettier                                                                                    |
| `npm run db:generate` / `npm run db:migrate` | Create / apply database migrations                                                          |
| `npm run pinecone:create-index`              | Create or check the Pinecone index                                                          |
| `npm run seed`                               | Ingest the files in `seed-docs/`                                                            |

## Testing

```bash
npm test
```

```bash
npm run test:e2e
```

- `npm test` covers chunking, extraction (PDF and DOCX fixtures), vector normalisation, the prompt builder, citation clean-up, the relevance threshold, input validation, the ingestion pipeline, and the chat, feedback, insights and admin routes. It runs against in-memory Postgres, with stand-ins for Gemini, Pinecone and Blob.
- `npm run test:e2e` builds and starts the app locally. It checks the screens with canned API responses, WCAG 2.1 AA (axe) in light and dark mode, layout at 360, 768 and 1440 px, keyboard focus, reduced motion and security headers. Install a browser first if needed: `npx playwright install chromium`.
- The **smoke test** (`tests/e2e/smoke.spec.ts`) uses the real services. It uploads `tests/fixtures/pattern-sop.pdf`, waits for Ready, asks a question it answers, opens a citation, asks an unrelated question, checks the gap appears in Insights, then deletes the document. It only runs when given a URL and the passcode:

  ```bash
  E2E_BASE_URL=https://your-app.vercel.app E2E_ADMIN_PASSCODE=your-passcode npm run test:e2e -- smoke
  ```

## Security notes

- Every key is used only in server code. Nothing secret is exposed to the browser.
- Admin actions (upload, delete, re-index) need `ADMIN_PASSCODE`. It is sent as the `x-admin-passcode` header, compared in constant time, and kept in the browser's `sessionStorage` only. Company SSO is out of scope for version 1.
- Uploads are checked by both extension and content type (PDF, DOCX, TXT, MD only; 20 MB maximum). Files are private blobs, and the server only fetches URLs in Vercel Blob storage.
- Document text is treated as untrusted: the system instruction tells the model to ignore instructions inside documents, and answers are rendered as Markdown without raw HTML.
- `/api/chat` allows about 20 questions a minute per IP (in memory, per server instance).
- Security headers (`next.config.ts`): a Content-Security-Policy (no nonces, so pages stay static), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`.
- No user names or customer data are stored. Questions are stored as typed, so the composer reminds analysts not to paste customer details.

## Project structure

```
app/            pages (ask, library, insights) and API routes (app/api/*)
components/     UI components (Rail, Thread, Message, CitationChip, SourcesPanel, …)
lib/            server and shared code: gemini, pinecone, chunker, extract, rag, ingest, db, auth, …
drizzle/        SQL migrations
scripts/        create-index.ts, seed.ts
seed-docs/      local files for npm run seed (not committed)
tests/          unit/ (Vitest), e2e/ (Playwright), fixtures/
```
