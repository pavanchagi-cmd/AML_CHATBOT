import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

// No user names or customer data are stored (spec section 5).

export const DOCUMENT_STATUSES = ["processing", "ready", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const RATINGS = ["up", "down"] as const;

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    fileName: text("file_name").notNull(),
    blobUrl: text("blob_url").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count").notNull().default(0),
    status: text("status").$type<DocumentStatus>().notNull().default("processing"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("documents_status_check", sql`${t.status} in ('processing', 'ready', 'failed')`),
    index("documents_created_at_idx").on(t.createdAt),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    categoryScope: text("category_scope").notNull(),
    answered: boolean("answered").notNull(),
    // Null when the search returned no passages at all.
    topScore: real("top_score"),
    topSection: text("top_section"),
    sourceIds: text("source_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    answer: text("answer"),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("questions_created_at_idx").on(t.createdAt)],
);

// One row per question; changing the rating updates it, clearing the rating deletes it.
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .unique()
      .references(() => questions.id, { onDelete: "cascade" }),
    rating: text("rating").$type<(typeof RATINGS)[number]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("feedback_rating_check", sql`${t.rating} in ('up', 'down')`)],
);

export type DocumentRecord = typeof documents.$inferSelect;
export type QuestionRecord = typeof questions.$inferSelect;
