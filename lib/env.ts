import { createHash, timingSafeEqual } from "node:crypto";
import { parseChatIds } from "./telegram";

export interface Env {
  token: string;
  chatIds: string[];
  webhookKey: string;
}

/** Reads all required env vars; logs the names of any that are missing (never their values). */
export function readEnv(scope: string): Env | null {
  const token = process.env.TG_TOKEN?.trim() ?? "";
  const chatIds = parseChatIds(process.env.TG_CHAT_ID ?? "");
  const webhookKey = process.env.WEBHOOK_KEY?.trim() ?? "";

  const missing: string[] = [];
  if (!token) missing.push("TG_TOKEN");
  if (chatIds.length === 0) missing.push("TG_CHAT_ID");
  if (!webhookKey) missing.push("WEBHOOK_KEY");
  if (missing.length > 0) {
    console.error(`[${scope}] missing environment variable(s): ${missing.join(", ")}`);
    return null;
  }
  return { token, chatIds, webhookKey };
}

/** Constant-time comparison; hashing first makes lengths equal so nothing leaks via timing. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Secret Telegram sends back in the X-Telegram-Bot-Api-Secret-Token header.
 * Derived from WEBHOOK_KEY so no extra env var is needed; hex is always a valid token.
 */
export function telegramSecret(webhookKey: string): string {
  return createHash("sha256").update(`telegram:${webhookKey}`).digest("hex");
}
