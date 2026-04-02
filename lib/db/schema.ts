import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const project = pgTable("Project", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  title: text("title").notNull(),
  totalMonthlyBudgetTarget: doublePrecision("totalMonthlyBudgetTarget"),
  totalMonthlyIncomeTarget: doublePrecision("totalMonthlyIncomeTarget"),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
});

export type Project = InferSelectModel<typeof project>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  projectId: uuid("projectId")
    .notNull()
    .references(() => project.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;
export type ChatWithProject = Chat & {
  projectTitle: string;
};

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const uploadedFile = pgTable("UploadedFile", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  projectId: uuid("projectId")
    .notNull()
    .references(() => project.id),
  filename: text("filename").notNull(),
  storagePath: text("storagePath").notNull(),
  uploadedAt: timestamp("uploadedAt").notNull(),
});

export type UploadedFile = InferSelectModel<typeof uploadedFile>;

export const transaction = pgTable("Transaction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  projectId: uuid("projectId")
    .notNull()
    .references(() => project.id),
  transactionDate: date("transactionDate", { mode: "string" }).notNull(),
  account: text("account").notNull(),
  description: text("description").notNull(),
  normalizedMerchant: text("normalizedMerchant").notNull(),
  rawCategory: text("rawCategory").notNull(),
  tags: text("tags"),
  amountSigned: doublePrecision("amountSigned").notNull(),
  outflowAmount: doublePrecision("outflowAmount").notNull(),
  mappedBucket: text("mappedBucket").notNull(),
  bucketGroup: text("bucketGroup").notNull(),
  includeFlag: boolean("includeFlag").notNull().default(true),
  exclusionReason: text("exclusionReason"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").notNull(),
});

export type Transaction = InferSelectModel<typeof transaction>;

export const financeOverride = pgTable("FinanceOverride", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  projectId: uuid("projectId")
    .notNull()
    .references(() => project.id),
  type: text("type").notNull(),
  key: text("key").notNull(),
  valueJson: json("valueJson").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type FinanceOverride = InferSelectModel<typeof financeOverride>;

export const financeCategorizationDenial = pgTable(
  "FinanceCategorizationDenial",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("projectId")
      .notNull()
      .references(() => project.id),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    summary: text("summary").notNull(),
    valueJson: json("valueJson").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  }
);

export type FinanceCategorizationDenial = InferSelectModel<
  typeof financeCategorizationDenial
>;

export const financePlan = pgTable("FinancePlan", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  projectId: uuid("projectId")
    .notNull()
    .references(() => project.id),
  planJson: json("planJson").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type FinancePlan = InferSelectModel<typeof financePlan>;
