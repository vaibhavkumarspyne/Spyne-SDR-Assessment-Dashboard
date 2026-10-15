// Drizzle mirror of db/schema.sql. Keep the two in step.
import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role", { enum: ["admin", "trainee"] }).notNull().default("trainee"),
  passwordHash: text("password_hash"),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
});

export const tests = pgTable("tests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  week: text("week").notNull().default(""),
  description: text("description").notNull().default(""),
  passPct: integer("pass_pct").notNull().default(75),
  maxAttempts: integer("max_attempts").notNull().default(2),
  liveAt: ts("live_at").notNull(),
  answersReleasedAt: ts("answers_released_at"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  topic: text("topic").notNull().default(""),
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  why: text("why").notNull().default(""),
  example: text("example").notNull().default(""),
});

export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // question id -> chosen option index (original order)
  answers: jsonb("answers").$type<Record<string, number>>().notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  pct: integer("pct").notNull(),
  passed: boolean("passed").notNull(),
  startedAt: ts("started_at"),
  submittedAt: ts("submitted_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
