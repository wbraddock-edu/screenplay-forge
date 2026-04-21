import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { sqlite } from "./db";
import { eq } from "drizzle-orm";
import {
  users,
  authSessions,
  passwordResets,
  sessions,
  supportTickets,
  scanRequestSchema,
  convertRequestSchema,
  type DetectedChapter,
  type ConvertedChapter,
  type ScreenplayElement,
} from "@shared/schema";
import { registerStripeRoutes, canAccessFeatures } from "./stripe";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  AlignmentType,
} from "docx";

declare module "express" {
  interface Request {
    userId?: number;
  }
}

// ── Persistent Auth (Forge standard) ──

const AUTH_COOKIE_NAME = "forge_session";
const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function extractAuthToken(req: Request): string | null {
  const auth = (req.headers["authorization"] as string) || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer) return bearer;
  const cookies = parseCookies(req.headers["cookie"] as string | undefined);
  return cookies[AUTH_COOKIE_NAME] || null;
}

function buildSessionCookie(token: string, clear = false): string {
  const isProd = process.env.NODE_ENV === "production";
  const forceCrossSite = process.env.AUTH_COOKIE_SAMESITE_NONE === "1";
  const sameSite = forceCrossSite ? "None" : "Lax";
  const secure = isProd || forceCrossSite;
  const parts = [
    `${AUTH_COOKIE_NAME}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push("Secure");
  if (clear) {
    parts.push("Max-Age=0");
    parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  } else {
    parts.push(`Max-Age=${Math.floor(AUTH_COOKIE_MAX_AGE_MS / 1000)}`);
    parts.push(`Expires=${new Date(Date.now() + AUTH_COOKIE_MAX_AGE_MS).toUTCString()}`);
  }
  return parts.join("; ");
}

function setAuthCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", buildSessionCookie(token, false));
}

function clearAuthCookie(res: Response) {
  res.setHeader("Set-Cookie", buildSessionCookie("", true));
}

// ── AI Provider Abstraction ──

async function callTextAI(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} - ${err}`);
    }
    const data = await res.json();
    return data.content[0].text;
  } else if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8192,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} - ${err}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  } else if (provider === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
          },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google AI API error: ${res.status} - ${err}`);
    }
    const data = await res.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("Google AI empty response:", JSON.stringify(data).substring(0, 500));
      throw new Error("AI returned an empty response. The content may have been filtered. Try again or use a shorter text.");
    }
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

// ── Prompt Templates ──

const SCAN_SYSTEM_PROMPT = `You are an expert screenplay adapter and literary analyst. Your job is to analyze prose manuscripts and identify their natural chapter or section divisions so they can be converted into screenplay format one chapter at a time.

For each chapter or natural section you detect, provide:
- number: sequential chapter number (integer starting at 1)
- title: the chapter title if one exists, or a descriptive title based on content (e.g. "The Arrival", "Chapter 3 - Betrayal")
- wordCount: approximate word count for this chapter/section
- briefSummary: 1-2 sentence summary of what happens in this chapter
- estimatedPages: estimated screenplay pages (roughly 1 page per 250 words of prose, but adjust based on dialogue density — dialogue-heavy sections convert to more pages)

Look for chapters indicated by:
- Explicit "Chapter X" headings
- Numbered sections
- Named parts or sections
- Large breaks with scene/location changes
- Natural narrative divisions (time jumps, POV shifts)

If the text has no clear chapter divisions, create logical sections of roughly 2000-5000 words each based on narrative beats.

Return a JSON object with a "chapters" array:
{"chapters": [...]}`;

const CONVERT_SYSTEM_PROMPT = `You are an expert screenplay adapter who converts prose manuscripts into properly formatted screenplays. You must transform narrative prose into cinematic screenplay format following industry conventions.

Rules for conversion:
1. SCENE HEADINGS (slug lines): Create INT./EXT. headings whenever the location or time of day changes. Format: "INT. LOCATION - TIME" or "EXT. LOCATION - TIME". Use CONTINUOUS, LATER, MOMENTS LATER, etc. as appropriate.

2. ACTION LINES: Convert narrative description into present-tense, visual action lines. Be concise and cinematic. Show, don't tell. Remove internal thoughts that can't be filmed unless converting to V.O.

3. CHARACTER NAMES: When a character speaks, their name appears in UPPERCASE centered above their dialogue.

4. DIALOGUE: Convert all quoted speech into proper dialogue blocks. Maintain the character's voice and speech patterns.

5. PARENTHETICALS: Add brief emotional/delivery cues in parentheses between character name and dialogue when the tone isn't obvious from context. Keep them minimal — (whispering), (angry), (sotto), (beat), (continuing), etc.

6. VOICE OVER (V.O.): Convert internal monologue, first-person narration, or thoughts into V.O. when it serves the story. Alternatively, find visual ways to convey internal states.

7. TRANSITIONS: Insert CUT TO:, DISSOLVE TO:, SMASH CUT TO:, MATCH CUT TO:, FADE IN:, FADE OUT. at appropriate moments. Don't overuse — modern screenplays use fewer explicit transitions.

8. VISUAL STORYTELLING: Where prose describes emotions or internal states, find cinematic equivalents — facial expressions, body language, environmental details, symbolic imagery.

Return a JSON object with:
{
  "chapterNumber": <number>,
  "chapterTitle": "<title>",
  "elements": [
    {"type": "scene_heading", "text": "INT. COFFEE SHOP - MORNING"},
    {"type": "action", "text": "Sunlight streams through..."},
    {"type": "character", "text": "SARAH"},
    {"type": "parenthetical", "text": "(nervously)"},
    {"type": "dialogue", "text": "I didn't expect to see you here."},
    {"type": "transition", "text": "CUT TO:"},
    ...
  ],
  "pageCount": <estimated pages>,
  "sceneCount": <number of scenes>
}

Element types: "scene_heading", "action", "character", "parenthetical", "dialogue", "transition", "voice_over"`;

// ── DOCX Generation (Screenplay Format) ──

function buildScreenplayDocx(
  chapters: { chapterNumber: number; chapterTitle: string; elements: ScreenplayElement[]; pageCount: number; sceneCount: number }[]
): Promise<Buffer> {
  const allChildren: any[] = [];

  // Title page
  allChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "", size: 24, font: "Courier New" }),
      ],
      spacing: { after: 2400 },
    })
  );
  allChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "SCREENPLAY", bold: true, size: 28, font: "Courier New" }),
      ],
      spacing: { after: 200 },
      alignment: AlignmentType.CENTER,
    })
  );
  allChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Generated by Screenplay Forge", size: 20, font: "Courier New", color: "666666" }),
      ],
      spacing: { after: 600 },
      alignment: AlignmentType.CENTER,
    })
  );

  for (const chapter of chapters) {
    // Chapter divider
    allChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: `--- CHAPTER ${chapter.chapterNumber}: ${chapter.chapterTitle.toUpperCase()} ---`, bold: true, size: 24, font: "Courier New" }),
        ],
        spacing: { before: 600, after: 400 },
        alignment: AlignmentType.CENTER,
      })
    );

    for (const el of chapter.elements) {
      switch (el.type) {
        case "scene_heading":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text.toUpperCase(), bold: true, size: 24, font: "Courier New" }),
              ],
              spacing: { before: 400, after: 200 },
            })
          );
          break;

        case "action":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text, size: 24, font: "Courier New" }),
              ],
              spacing: { after: 200 },
            })
          );
          break;

        case "character":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text.toUpperCase(), size: 24, font: "Courier New" }),
              ],
              spacing: { before: 200, after: 0 },
              alignment: AlignmentType.CENTER,
            })
          );
          break;

        case "parenthetical":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text, italics: true, size: 24, font: "Courier New" }),
              ],
              spacing: { after: 0 },
              indent: { left: 2160 },
            })
          );
          break;

        case "dialogue":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text, size: 24, font: "Courier New" }),
              ],
              spacing: { after: 200 },
              indent: { left: 1440 },
            })
          );
          break;

        case "voice_over":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text, italics: true, size: 24, font: "Courier New" }),
              ],
              spacing: { after: 200 },
              indent: { left: 1440 },
            })
          );
          break;

        case "transition":
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text.toUpperCase(), size: 24, font: "Courier New" }),
              ],
              spacing: { before: 200, after: 200 },
              alignment: AlignmentType.RIGHT,
            })
          );
          break;

        default:
          allChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: el.text, size: 24, font: "Courier New" }),
              ],
              spacing: { after: 200 },
            })
          );
      }
    }
  }

  // Footer
  allChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Generated by Screenplay Forge — littleredappleproductions.com", size: 18, font: "Courier New", color: "999999", italics: true }),
      ],
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    sections: [{ children: allChildren }],
  });

  return Packer.toBuffer(doc);
}

// ── Fountain Export ──

function buildFountainText(
  chapters: { chapterNumber: number; chapterTitle: string; elements: ScreenplayElement[]; pageCount: number; sceneCount: number }[]
): string {
  const lines: string[] = [];

  lines.push("Title: Screenplay");
  lines.push("Credit: Adapted by Screenplay Forge");
  lines.push("");
  lines.push("===");
  lines.push("");

  for (const chapter of chapters) {
    // Chapter divider as a section heading
    lines.push(`# Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`);
    lines.push("");

    for (const el of chapter.elements) {
      switch (el.type) {
        case "scene_heading":
          // Fountain scene headings start with INT./EXT. and are auto-detected
          // Force with a leading dot if needed
          if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/.test(el.text.toUpperCase())) {
            lines.push(el.text.toUpperCase());
          } else {
            lines.push(`.${el.text.toUpperCase()}`);
          }
          lines.push("");
          break;

        case "action":
          lines.push(el.text);
          lines.push("");
          break;

        case "character":
          // Fountain: character names in uppercase
          lines.push(el.text.toUpperCase());
          break;

        case "parenthetical":
          // Fountain: parentheticals in parens on their own line
          if (el.text.startsWith("(") && el.text.endsWith(")")) {
            lines.push(el.text);
          } else {
            lines.push(`(${el.text})`);
          }
          break;

        case "dialogue":
          lines.push(el.text);
          lines.push("");
          break;

        case "voice_over":
          // In Fountain, V.O. is indicated after character name, but if standalone:
          lines.push(el.text);
          lines.push("");
          break;

        case "transition":
          // Fountain transitions end with "TO:" and are right-aligned automatically
          if (el.text.toUpperCase().endsWith("TO:") || el.text.toUpperCase() === "FADE OUT.") {
            lines.push(`> ${el.text.toUpperCase()}`);
          } else {
            lines.push(`> ${el.text.toUpperCase()}`);
          }
          lines.push("");
          break;

        default:
          lines.push(el.text);
          lines.push("");
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ── Route Registration ──

export async function registerRoutes(httpServer: Server, app: Express) {
  // Increase timeouts for long AI calls
  httpServer.timeout = 300000;
  httpServer.keepAliveTimeout = 300000;

  const ADMIN_EMAIL = "designholistically@gmail.com";

  // ── Auth Routes (before middleware) ──

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, displayName } = req.body;
      if (!email || !password || !displayName) {
        return res.status(400).json({ error: "email, password, and displayName are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const existing = db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).get();
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const passwordHash = bcrypt.hashSync(password, 10);
      const now = new Date().toISOString();
      const user = db.insert(users).values({
        email: email.toLowerCase().trim(),
        passwordHash,
        displayName: displayName.trim(),
        createdAt: now,
      }).returning().get();

      if (email.toLowerCase().trim() === ADMIN_EMAIL) {
        sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE_MS).toISOString();
      db.insert(authSessions).values({ userId: user.id, token, expiresAt, createdAt: now }).run();

      setAuthCookie(res, token);
      return res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }
      const user = db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).get();
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      if (!bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (email.toLowerCase().trim() === ADMIN_EMAIL) {
        sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
      }

      const now = new Date().toISOString();
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE_MS).toISOString();
      db.insert(authSessions).values({ userId: user.id, token, expiresAt, createdAt: now }).run();

      setAuthCookie(res, token);
      return res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const token = extractAuthToken(req);
    if (token) {
      try { db.delete(authSessions).where(eq(authSessions.token, token)).run(); } catch {}
    }
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    const token = extractAuthToken(req);
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const session = db.select().from(authSessions).where(eq(authSessions.token, token)).get();
    if (!session || new Date(session.expiresAt) < new Date()) {
      if (session) { try { db.delete(authSessions).where(eq(authSessions.token, token)).run(); } catch {} }
      clearAuthCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }
    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) return res.status(401).json({ error: "User not found" });

    // Refresh cookie (rolling expiry) so active users stay signed in
    setAuthCookie(res, token);
    return res.json({ id: user.id, email: user.email, displayName: user.displayName });
  });

  app.post("/api/auth/forgot-password", (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "email is required" });

      const user = db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).get();
      if (!user) {
        return res.json({ ok: true, message: "If that email exists, a reset token has been generated." });
      }

      const token = crypto.randomUUID();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.insert(passwordResets).values({ userId: user.id, token, expiresAt, createdAt: now }).run();

      return res.json({ ok: true, resetToken: token, message: "Reset token generated. Share with admin or use directly." });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/reset-password", (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ error: "token and newPassword are required" });
      if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const reset = db.select().from(passwordResets).where(eq(passwordResets.token, token)).get();
      if (!reset || new Date(reset.expiresAt) < new Date()) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const passwordHash = bcrypt.hashSync(newPassword, 10);
      db.update(users).set({ passwordHash }).where(eq(users.id, reset.userId)).run();
      db.delete(passwordResets).where(eq(passwordResets.token, token)).run();

      // Invalidate any existing sessions for this user (security: password changed)
      try { db.delete(authSessions).where(eq(authSessions.userId, reset.userId)).run(); } catch {}

      // Issue a fresh session + cookie so the user is signed in after reset
      const user = db.select().from(users).where(eq(users.id, reset.userId)).get();
      const now = new Date().toISOString();
      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE_MS).toISOString();
      db.insert(authSessions).values({ userId: reset.userId, token: sessionToken, expiresAt, createdAt: now }).run();
      setAuthCookie(res, sessionToken);

      return res.json({
        ok: true,
        message: "Password has been reset. You are now signed in.",
        token: sessionToken,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Auth Middleware — protects all /api/* except /api/auth/* and /api/stripe/webhook ──
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/auth/") || req.path.startsWith("/auth") || req.path === "/stripe/webhook") {
      return next();
    }
    const token = extractAuthToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const session = db.select().from(authSessions).where(eq(authSessions.token, token)).get();
    if (!session || new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }
    req.userId = session.userId;
    next();
  });

  // Register Stripe subscription routes
  registerStripeRoutes(app);

  // Feature gate helper
  function requireActiveSubscription(req: Request, res: Response): boolean {
    const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.userId!) as any;
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return false; }
    if (!canAccessFeatures(user)) {
      res.status(403).json({ error: "subscription_required", message: "Your trial has expired. Please upgrade to continue using Screenplay Forge." });
      return false;
    }
    return true;
  }

  // Platform API key resolver
  function resolveApiKey(req: Request): { provider: string; apiKey: string } {
    const body = req.body || {};
    let provider = body.provider || "google";
    let apiKey = body.apiKey || "";

    // If no key in request body, check user's saved key
    if (!apiKey && req.userId) {
      try {
        const user = sqlite.prepare("SELECT api_provider, api_key FROM users WHERE id = ?").get(req.userId) as any;
        if (user?.api_key) {
          apiKey = user.api_key;
          provider = user.api_provider || provider;
        }
      } catch {}
    }

    // Final fallback: platform key
    const PLATFORM_KEY = process.env.GOOGLE_API_KEY || "";
    if (!apiKey && PLATFORM_KEY) {
      apiKey = PLATFORM_KEY;
      provider = "google";
    }
    return { provider, apiKey };
  }

  // ── User-level API key persistence ──

  app.get("/api/user/apikey", (req: Request, res: Response) => {
    try {
      const row = sqlite.prepare("SELECT api_provider, api_key FROM users WHERE id = ?").get(req.userId!) as any;
      if (!row) return res.json({ provider: "google", apiKey: "" });
      return res.json({ provider: row.api_provider || "google", apiKey: row.api_key || "" });
    } catch { return res.json({ provider: "google", apiKey: "" }); }
  });

  app.post("/api/user/apikey", (req: Request, res: Response) => {
    try {
      const { provider, apiKey } = req.body;
      sqlite.prepare("UPDATE users SET api_provider = ?, api_key = ? WHERE id = ?").run(provider || "google", apiKey || "", req.userId!);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Session Save/Load (per-user) ──

  app.post("/api/session/save", (req: Request, res: Response) => {
    try {
      const key = `user_${req.userId}`;
      const stateJson = JSON.stringify(req.body.state || {});
      const now = new Date().toISOString();
      const existing = db.select().from(sessions).where(eq(sessions.sessionKey, key)).get();
      if (existing) {
        db.update(sessions).set({ stateJson, updatedAt: now }).where(eq(sessions.sessionKey, key)).run();
      } else {
        db.insert(sessions).values({ sessionKey: key, userId: req.userId!, stateJson, updatedAt: now }).run();
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/session/load", (req: Request, res: Response) => {
    try {
      const key = `user_${req.userId}`;
      const session = db.select().from(sessions).where(eq(sessions.sessionKey, key)).get();
      if (!session) return res.json({ state: null });
      return res.json({ state: JSON.parse(session.stateJson) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Projects API ──

  app.get("/api/projects", (req: Request, res: Response) => {
    try {
      const rows = sqlite.prepare(
        `SELECT id, name, created_at, updated_at,
         json_extract(state_json, '$.detectedChapters') as chapters_json
         FROM projects WHERE user_id = ? ORDER BY updated_at DESC`
      ).all(req.userId!) as any[];

      const projects = rows.map((r: any) => {
        let chapterCount = 0;
        let convertedCount = 0;
        try {
          const c = JSON.parse(r.chapters_json || '[]');
          chapterCount = c.length;
        } catch {}
        try {
          const full = sqlite.prepare(`SELECT state_json FROM projects WHERE id = ?`).get(r.id) as any;
          if (full) {
            const state = JSON.parse(full.state_json);
            convertedCount = Object.keys(state.convertedChapters || {}).length;
          }
        } catch {}
        return {
          id: r.id,
          name: r.name,
          chapterCount,
          convertedCount,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      });

      return res.json({ projects });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects", (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') return res.status(400).json({ error: "name required" });
      const now = new Date().toISOString();
      const result = sqlite.prepare(
        `INSERT INTO projects (user_id, name, state_json, created_at, updated_at) VALUES (?, ?, '{}', ?, ?)`
      ).run(req.userId!, name.trim(), now, now);
      return res.json({ id: Number(result.lastInsertRowid), name: name.trim() });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id", (req: Request, res: Response) => {
    try {
      const row = sqlite.prepare(
        `SELECT id, name, state_json, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?`
      ).get(parseInt(req.params.id as string), req.userId!) as any;
      if (!row) return res.status(404).json({ error: "Project not found" });
      const rawJson = `{"id":${row.id},"name":${JSON.stringify(row.name)},"state":${row.state_json || '{}'},"createdAt":${JSON.stringify(row.created_at)},"updatedAt":${JSON.stringify(row.updated_at)}}`;
      res.setHeader('Content-Type', 'application/json');
      return res.send(rawJson);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/projects/:id", (req: Request, res: Response) => {
    try {
      const { state, name } = req.body;
      const now = new Date().toISOString();
      const updates: string[] = [];
      const params: any[] = [];
      if (state) { updates.push('state_json = ?'); params.push(JSON.stringify(state)); }
      if (name) { updates.push('name = ?'); params.push(name.trim()); }
      updates.push('updated_at = ?'); params.push(now);
      params.push(parseInt(req.params.id as string), req.userId!);

      sqlite.prepare(
        `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
      ).run(...params);

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/projects/:id", (req: Request, res: Response) => {
    try {
      sqlite.prepare(
        `DELETE FROM projects WHERE id = ? AND user_id = ?`
      ).run(parseInt(req.params.id as string), req.userId!);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/projects/:id/rename", (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') return res.status(400).json({ error: "name required" });
      sqlite.prepare(
        `UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      ).run(name.trim(), new Date().toISOString(), parseInt(req.params.id as string), req.userId!);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Support Tickets ──

  app.post("/api/support/ticket", (req: Request, res: Response) => {
    try {
      const { category, subject, message, errorContext } = req.body;
      if (!category || !subject || !message) return res.status(400).json({ error: "category, subject, and message are required" });
      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.userId!) as any;
      if (!user) return res.status(401).json({ error: "Not authenticated" });

      const now = new Date().toISOString();
      const result = db.insert(supportTickets).values({
        userId: req.userId!,
        userEmail: user.email,
        category,
        subject,
        message,
        errorContext: errorContext || null,
        status: "open",
        priority: "normal",
        createdAt: now,
      }).returning().get();

      return res.json({ id: result.id, message: "Support ticket created" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/support/tickets", (req: Request, res: Response) => {
    try {
      const tickets = sqlite.prepare(
        `SELECT id, category, subject, status, priority, created_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`
      ).all(req.userId!) as any[];
      return res.json({ tickets });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: List users ──

  app.get("/api/admin/users", (req: Request, res: Response) => {
    const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.userId!) as any;
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const allUsers = sqlite.prepare("SELECT id, email, display_name, role, subscription_status, created_at FROM users ORDER BY id").all();
    return res.json({ users: allUsers });
  });

  // ── Story Forge cross-app integration ───────────────────────────────────────────
  const STORY_FORGE_URL = process.env.STORY_FORGE_URL || "https://story-forge-backend-production.up.railway.app";
  const FORGE_SECRET = process.env.FORGE_CROSS_APP_SECRET || "";

  // List all Story Forge projects for the logged-in user's email
  app.get("/api/storyforge/projects", async (req: Request, res: Response) => {
    if (!FORGE_SECRET) return res.status(503).json({ error: "FORGE_CROSS_APP_SECRET not configured in Screenplay Forge Railway Variables" });
    const userRow = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.userId!) as any;
    if (!userRow) return res.status(404).json({ error: "User not found" });
    try {
      const url = `${STORY_FORGE_URL}/api/shared/projects?secret=${encodeURIComponent(FORGE_SECRET)}&email=${encodeURIComponent(userRow.email)}`;
      console.log("[StoryForge] Fetching:", STORY_FORGE_URL + "/api/shared/projects", "secret set:", !!FORGE_SECRET);
      const r = await fetch(url);
      const body = await r.json().catch(() => ({}));
      console.log("[StoryForge] Status:", r.status, JSON.stringify(body).slice(0, 100));
      if (!r.ok) return res.status(r.status).json({ error: `Story Forge returned ${r.status}`, detail: body, calledUrl: STORY_FORGE_URL });
      res.json(body);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to reach Story Forge", url: STORY_FORGE_URL });
    }
  });

  // Fetch all chapters for a specific project by title
  app.get("/api/storyforge/chapters", async (req: Request, res: Response) => {
    if (!FORGE_SECRET) return res.status(503).json({ error: "FORGE_CROSS_APP_SECRET not configured in Screenplay Forge" });
    const userRow = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.userId!) as any;
    if (!userRow) return res.status(404).json({ error: "User not found" });
    const project = req.query.project as string;
    if (!project) return res.status(400).json({ error: "project query param required" });
    res.setTimeout(60000);
    try {
      const url = `${STORY_FORGE_URL}/api/shared/chapters?secret=${encodeURIComponent(FORGE_SECRET)}&email=${encodeURIComponent(userRow.email)}&project=${encodeURIComponent(project)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 58000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: `Story Forge returned ${r.status}`, detail: body });
      res.json(body);
    } catch (e: any) {
      const msg = e.name === "AbortError" ? "Story Forge took too long to respond (timeout)" : e.message || "Failed to reach Story Forge";
      res.status(500).json({ error: msg, url: STORY_FORGE_URL });
    }
  });

  // ── Step 1: Scan text for chapters ──
  app.post("/api/scan", async (req: Request, res: Response) => {
    if (!requireActiveSubscription(req, res)) return;
    try {
      const parsed = scanRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const { text } = parsed.data;
      const sourceType = "prose manuscript";
      const { provider, apiKey } = resolveApiKey(req);

      // Break text into chunks for large manuscripts
      // 30k chars per chunk to stay well within Gemini token limits
      const CHUNK_SIZE = 30000;
      const chunks: string[] = [];
      if (text.length <= CHUNK_SIZE) {
        chunks.push(text);
      } else {
        let remaining = text;
        while (remaining.length > 0) {
          if (remaining.length <= CHUNK_SIZE) {
            chunks.push(remaining);
            break;
          }
          let breakPoint = remaining.lastIndexOf('\n\n', CHUNK_SIZE);
          if (breakPoint < CHUNK_SIZE * 0.5) breakPoint = remaining.lastIndexOf('\n', CHUNK_SIZE);
          if (breakPoint < CHUNK_SIZE * 0.5) breakPoint = CHUNK_SIZE;
          chunks.push(remaining.substring(0, breakPoint));
          remaining = remaining.substring(breakPoint).trim();
        }
      }

      console.log(`[Scan] ${text.length} chars, ${chunks.length} chunk(s), provider=${provider}, hasKey=${!!apiKey}, keyPrefix=${apiKey?.substring(0,8)}...`);

      let allChapters: DetectedChapter[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkLabel = chunks.length > 1 ? ` (Part ${i + 1} of ${chunks.length})` : '';
        let rawResult = '';
        let success = false;

        // Retry up to 2 times per chunk
        for (let attempt = 0; attempt < 2 && !success; attempt++) {
          try {
            if (attempt > 0) {
              console.log(`[Scan] Retrying chunk ${i + 1} (attempt ${attempt + 1})...`);
              await new Promise(r => setTimeout(r, 3000));
            }
            rawResult = await callTextAI(
              provider,
              apiKey,
              SCAN_SYSTEM_PROMPT,
              `Here is ${sourceType} text to analyze for chapters/sections${chunkLabel}:\n\n${chunks[i]}`
            );

            let jsonStr = rawResult;
            jsonStr = jsonStr.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
            const firstBrace = jsonStr.indexOf("{");
            const firstBracket = jsonStr.indexOf("[");
            const start = Math.min(
              firstBrace !== -1 ? firstBrace : Infinity,
              firstBracket !== -1 ? firstBracket : Infinity
            );
            if (start !== Infinity) {
              const lastBrace = jsonStr.lastIndexOf("}");
              const lastBracket = jsonStr.lastIndexOf("]");
              const end = Math.max(lastBrace, lastBracket);
              jsonStr = jsonStr.substring(start, end + 1);
            }
            const parsedJson = JSON.parse(jsonStr);
            const chunkChapters = parsedJson.chapters || (Array.isArray(parsedJson) ? parsedJson : [parsedJson]);
            console.log(`[Scan] Chunk ${i + 1}/${chunks.length}: found ${chunkChapters.length} chapters`);
            allChapters = allChapters.concat(chunkChapters);
            success = true;
          } catch (e: any) {
            console.error(`[Scan] Chunk ${i + 1}/${chunks.length} attempt ${attempt + 1} failed:`, e.message);
            if (rawResult) console.error(`[Scan] Raw response (first 500):`, rawResult.substring(0, 500));
          }
        }

        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2000));
      }

      // Renumber chapters sequentially
      allChapters = allChapters.map((ch, idx) => ({
        ...ch,
        number: idx + 1,
      }));

      console.log(`[Scan] Done. Found ${allChapters.length} chapters.`);
      if (allChapters.length === 0) {
        return res.status(422).json({ error: `Scan completed but found 0 chapters across ${chunks.length} chunk(s). The AI may be overloaded — try again in a moment.` });
      }
      return res.json({ chapters: allChapters });
    } catch (err: any) {
      console.error("[Scan] Top-level error:", err.message, err.stack?.substring(0, 300));
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Step 2: Convert chapter to screenplay ──
  app.post("/api/convert", async (req: Request, res: Response) => {
    if (!requireActiveSubscription(req, res)) return;
    try {
      const parsed = convertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const { text, chapterNumber, chapterTitle, genre, pacing, dialogueStyle, sceneDetail, characterBibles } = parsed.data;
      const { provider, apiKey } = resolveApiKey(req);

      // Build user prompt with settings context
      let settingsContext = '';
      if (genre) settingsContext += `Genre: ${genre}\n`;
      if (pacing) settingsContext += `Pacing style: ${pacing}\n`;
      if (dialogueStyle) settingsContext += `Dialogue style: ${dialogueStyle}\n`;
      if (sceneDetail) settingsContext += `Scene detail level: ${sceneDetail}\n`;
      if (characterBibles && characterBibles.length > 0) {
        settingsContext += `\nCharacter Bibles (use these for dialogue voice and behavior):\n`;
        for (const bible of characterBibles) {
          settingsContext += `- ${bible.name}: ${bible.description}\n`;
        }
      }

      const userPrompt = `${settingsContext ? `Conversion Settings:\n${settingsContext}\n` : ''}Convert the following prose chapter into screenplay format.

Chapter ${chapterNumber}: ${chapterTitle || 'Untitled'}

---

${text}`;

      const result = await callTextAI(
        provider,
        apiKey,
        CONVERT_SYSTEM_PROMPT,
        userPrompt
      );

      let converted: ConvertedChapter;
      try {
        let jsonStr = result;
        jsonStr = jsonStr.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const firstBrace = jsonStr.indexOf("{");
        if (firstBrace >= 0) {
          const lastBrace = jsonStr.lastIndexOf("}");
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        converted = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse convert response. Raw (first 500 chars):", result.substring(0, 500));
        return res.status(422).json({ error: "Failed to parse AI response. Please try again." });
      }

      return res.json({ converted });
    } catch (err: any) {
      console.error("Convert error:", err);
      return res.status(422).json({ error: err.message });
    }
  });

  // ── Export: Fountain format ──
  app.post("/api/export/fountain", async (req: Request, res: Response) => {
    if (!requireActiveSubscription(req, res)) return;
    try {
      const { chapters } = req.body;
      if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
        return res.status(400).json({ error: "No chapter data to export. Convert at least one chapter first." });
      }

      const fountainText = buildFountainText(chapters);

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="screenplay.fountain"');
      return res.send(fountainText);
    } catch (err: any) {
      console.error("Fountain export error:", err);
      return res.status(500).json({ error: "Failed to generate Fountain export." });
    }
  });

  // ── Export: PDF (DOCX with Courier for now) ──
  app.post("/api/export/pdf", async (req: Request, res: Response) => {
    if (!requireActiveSubscription(req, res)) return;
    try {
      const { chapters } = req.body;
      if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
        return res.status(400).json({ error: "No chapter data to export. Convert at least one chapter first." });
      }

      const buffer = await buildScreenplayDocx(chapters);

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", 'attachment; filename="screenplay.docx"');
      return res.send(buffer);
    } catch (err: any) {
      console.error("PDF export error:", err);
      return res.status(500).json({ error: "Failed to generate PDF export." });
    }
  });

  // ── Export: DOCX with proper screenplay formatting ──
  app.post("/api/export/docx", async (req: Request, res: Response) => {
    if (!requireActiveSubscription(req, res)) return;
    try {
      const { chapters } = req.body;
      if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
        return res.status(400).json({ error: "No chapter data to export. Convert at least one chapter first." });
      }

      const buffer = await buildScreenplayDocx(chapters);

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", 'attachment; filename="Screenplay.docx"');
      return res.send(buffer);
    } catch (err: any) {
      console.error("DOCX export error:", err);
      return res.status(500).json({ error: "Failed to generate DOCX export." });
    }
  });
}
