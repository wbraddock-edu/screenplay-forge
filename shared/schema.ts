import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Auth Tables ──

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Session Table ──

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionKey: text("session_key").notNull(),
  userId: integer("user_id"),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Support Tickets ──

export const supportTickets = sqliteTable("support_tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  errorContext: text("error_context"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  createdAt: text("created_at").notNull(),
});

// ── Screenplay Forge Types ──

// Detected chapter from manuscript scan
export const detectedChapterSchema = z.object({
  number: z.number(),
  title: z.string(),
  wordCount: z.number(),
  briefSummary: z.string(),
  estimatedPages: z.number(),
});
export type DetectedChapter = z.infer<typeof detectedChapterSchema>;

// Screenplay element types
export type ScreenplayElementType = "scene_heading" | "action" | "character" | "dialogue" | "parenthetical" | "transition" | "shot";

export const screenplayElementSchema = z.object({
  type: z.enum(["scene_heading", "action", "character", "dialogue", "parenthetical", "transition", "shot"]),
  text: z.string(),
});
export type ScreenplayElement = z.infer<typeof screenplayElementSchema>;

// Converted chapter result
export const convertedChapterSchema = z.object({
  chapterNumber: z.number(),
  chapterTitle: z.string(),
  elements: z.array(screenplayElementSchema),
  pageCount: z.number(),
  sceneCount: z.number(),
});
export type ConvertedChapter = z.infer<typeof convertedChapterSchema>;

// API requests
export const scanRequestSchema = z.object({
  text: z.string().min(50, "Please provide at least 50 characters of text"),
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().default(""),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

export const convertRequestSchema = z.object({
  text: z.string().min(1),
  chapterNumber: z.number(),
  chapterTitle: z.string(),
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().default(""),
  genre: z.string().default("drama"),
  pacing: z.enum(["tight", "standard", "expansive"]).default("standard"),
  dialogueStyle: z.enum(["faithful", "naturalized", "minimal"]).default("naturalized"),
  sceneDetail: z.enum(["minimal", "standard", "detailed"]).default("standard"),
  characterBibles: z.string().optional(),
});
export type ConvertRequest = z.infer<typeof convertRequestSchema>;
