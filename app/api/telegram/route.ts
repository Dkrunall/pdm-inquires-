import { NextResponse, type NextRequest } from "next/server";
import { replyFor } from "../../../lib/commands";
import { readEnv, safeEqual, telegramSecret } from "../../../lib/env";
import { sendMessage } from "../../../lib/telegram";

export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: JsonObject, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * Receives updates from Telegram (registered via /api/telegram/setup).
 * Only private-chat text messages get a reply; everything else is ignored.
 * Always answers 200 once authenticated so Telegram doesn't retry.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = readEnv("telegram-bot");
  if (!env) return json({ ok: false, error: "Server misconfigured" }, 500);

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !safeEqual(secret, telegramSecret(env.webhookKey))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return json({ ok: true, ignored: true }, 200);
  }

  const message = isObject(update) ? update.message : undefined;
  if (!isObject(message) || !isObject(message.chat)) return json({ ok: true, ignored: true }, 200);

  const { chat } = message;
  if (chat.type !== "private" || (typeof chat.id !== "number" && typeof chat.id !== "string")) {
    return json({ ok: true, ignored: true }, 200);
  }

  const chatId = String(chat.id);
  const text = typeof message.text === "string" ? message.text : "";
  await sendMessage(env.token, chatId, replyFor(text, chatId, env.chatIds));

  return json({ ok: true }, 200);
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
