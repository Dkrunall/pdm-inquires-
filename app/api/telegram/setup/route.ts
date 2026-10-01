import { NextResponse, type NextRequest } from "next/server";
import { BOT_COMMANDS } from "../../../../lib/commands";
import { readEnv, safeEqual, telegramSecret } from "../../../../lib/env";
import { callTelegram } from "../../../../lib/telegram";

export const dynamic = "force-dynamic";

/**
 * One-time setup, safe to repeat: open /api/telegram/setup?key=<WEBHOOK_KEY>
 * on the production domain. Points the bot's webhook at this deployment and
 * registers the command menu.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = readEnv("telegram-setup");
  if (!env) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  const key = request.nextUrl.searchParams.get("key");
  if (!key || !safeEqual(key, env.webhookKey)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = `${request.nextUrl.origin}/api/telegram`;
  const [webhook, commands] = await Promise.all([
    callTelegram(env.token, "setWebhook", {
      url: webhookUrl,
      secret_token: telegramSecret(env.webhookKey),
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
    callTelegram(env.token, "setMyCommands", { commands: BOT_COMMANDS }),
  ]);

  const ok = webhook && commands;
  return NextResponse.json({ ok, webhook, commands, webhookUrl }, { status: ok ? 200 : 502 });
}
