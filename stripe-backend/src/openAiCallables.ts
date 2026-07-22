/**
 * OpenAI HTTPS callables — secrets stay on Functions; never return the API key to clients.
 */
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import OpenAI from "openai";
import {assertAdminCallable} from "./adminStripeAuth.js";
import {buildEmoAiSystemPrompt} from "./emoAiSystemPrompt.js";

const openAiKeySecret = defineSecret("OPENAI_API_KEY");

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

function requireOpenAiKey(): string {
  const key = (openAiKeySecret.value() || process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "OpenAI is not configured on the server.",
    );
  }
  return key;
}

function requireAuth(context: CallableContext): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  return context.auth.uid;
}

function asObject(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object"
    ? (data as Record<string, unknown>)
    : {};
}

function sanitizeHistory(raw: unknown, maxMessages = 24): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const row of raw.slice(-maxMessages)) {
    if (!row || typeof row !== "object") continue;
    const role = (row as {role?: unknown}).role;
    const content = (row as {content?: unknown}).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, 4000);
    if (!trimmed) continue;
    out.push({role, content: trimmed});
  }
  return out;
}

/**
 * Emo AI chat completion (non-streaming). Client may animate tokens locally.
 */
export const emoAiChat = functions
  .runWith({secrets: ["OPENAI_API_KEY"], timeoutSeconds: 60, memory: "512MB"})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    requireAuth(context);
    const payload = asObject(data);
    const history = sanitizeHistory(payload.messages);
    if (history.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "messages are required.",
      );
    }
    const userDisplayName =
      typeof payload.userDisplayName === "string"
        ? payload.userDisplayName.trim().slice(0, 80)
        : "";
    const platformContext =
      typeof payload.platformContext === "string"
        ? payload.platformContext.trim().slice(0, 12000)
        : "";

    const openai = new OpenAI({apiKey: requireOpenAiKey()});
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {role: "system", content: buildEmoAiSystemPrompt(userDisplayName || null)},
    ];
    if (platformContext) {
      messages.push({role: "system", content: platformContext});
    }
    messages.push(...history);

    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 450,
        temperature: 0.75,
      });
      const reply = res.choices[0]?.message?.content?.trim() ?? "";
      if (!reply) {
        throw new functions.https.HttpsError(
          "internal",
          "Emo went quiet for a second — try again?",
        );
      }
      return {reply};
    } catch (e) {
      if (e instanceof functions.https.HttpsError) throw e;
      console.error("[emoAiChat] OpenAI failed", e);
      throw new functions.https.HttpsError(
        "internal",
        "Could not reach Emo AI right now.",
      );
    }
  });

type MatchLine = {
  restaurantName?: string;
  foodName?: string;
  distanceMeters?: number | null;
};

/**
 * Short matching-engine copy for nearby orders.
 */
export const generateMatchSuggestion = functions
  .runWith({secrets: ["OPENAI_API_KEY"], timeoutSeconds: 30, memory: "256MB"})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    requireAuth(context);
    const payload = asObject(data);
    const userFood =
      typeof payload.userFood === "string"
        ? payload.userFood.trim().slice(0, 200)
        : "";
    const matchesRaw = Array.isArray(payload.matches) ? payload.matches : [];
    const matches: MatchLine[] = matchesRaw.slice(0, 5).map((row) => {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        restaurantName:
          typeof r.restaurantName === "string" ? r.restaurantName.slice(0, 120) : "",
        foodName: typeof r.foodName === "string" ? r.foodName.slice(0, 120) : "",
        distanceMeters:
          typeof r.distanceMeters === "number" && Number.isFinite(r.distanceMeters)
            ? r.distanceMeters
            : null,
      };
    });

    if (matches.length === 0) {
      return {
        text: userFood
          ? `No smart matches available yet for ${userFood} — check back soon, or start an order others can join.`
          : "No smart matches available yet — check back soon, or start an order others can join.",
      };
    }

    const lines = matches
      .map(
        (m, i) =>
          `${i + 1}. ${m.restaurantName || m.foodName || "Order"} (~${
            m.distanceMeters != null ? `${Math.round(m.distanceMeters)}m` : "?"
          })`,
      )
      .join("\n");

    try {
      const openai = new OpenAI({apiKey: requireOpenAiKey()});
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You help people split food orders. One short friendly sentence (max 220 chars), no markdown, suggest the best nearby pick.",
          },
          {
            role: "user",
            content: `User wants: ${userFood || "something to eat"}.\nNearby:\n${lines}`,
          },
        ],
        max_tokens: 120,
        temperature: 0.6,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (text) return {text: text.slice(0, 280)};
    } catch (e) {
      console.warn("[generateMatchSuggestion] OpenAI failed", e);
    }

    const top = matches[0];
    return {
      text: `Nearby: ${top.restaurantName || top.foodName || "a match"} is your closest pick.`,
    };
  });

/**
 * Admin food-card AI description generator.
 */
export const generateFoodCardDescription = functions
  .runWith({secrets: ["OPENAI_API_KEY"], timeoutSeconds: 30, memory: "256MB"})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    await assertAdminCallable(context);
    const payload = asObject(data);
    const title =
      typeof payload.title === "string" ? payload.title.trim().slice(0, 120) : "";
    const restaurantName =
      typeof payload.restaurantName === "string"
        ? payload.restaurantName.trim().slice(0, 120)
        : "";
    const adminDescription =
      typeof payload.adminDescription === "string"
        ? payload.adminDescription.trim().slice(0, 500)
        : "";

    if (!title && !restaurantName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "title or restaurantName is required.",
      );
    }

    try {
      const openai = new OpenAI({apiKey: requireOpenAiKey()});
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You write concise food app card descriptions. 1–2 sentences, max 280 characters, appetizing but not claiming allergens or dietary facts. No markdown, no emojis unless one tasteful food emoji at end. Do not invent ingredients.",
          },
          {
            role: "user",
            content: `Dish name: ${title || "Dish"}\nVenue: ${restaurantName || "Restaurant"}${
              adminDescription ? `\nNotes from venue: ${adminDescription}` : ""
            }`,
          },
        ],
        max_tokens: 120,
        temperature: 0.65,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) {
        throw new functions.https.HttpsError(
          "internal",
          "AI returned an empty description.",
        );
      }
      return {description: text.slice(0, 400)};
    } catch (e) {
      if (e instanceof functions.https.HttpsError) throw e;
      console.error("[generateFoodCardDescription] OpenAI failed", e);
      throw new functions.https.HttpsError(
        "internal",
        "Could not generate AI description.",
      );
    }
  });
