const REQUEST_TIMEOUT_MS = 10_000;

export interface SendResult {
  ok: boolean;
  failed: number;
  total: number;
}

export function parseChatIds(raw: string): string[] {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/** Strips the bot token from anything we are about to log. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join("<TG_TOKEN>") : text;
}

/**
 * Calls a Bot API method. Returns true on success; on failure logs Telegram's
 * response body (never the token or the request payload) and returns false.
 */
export async function callTelegram(
  token: string,
  method: string,
  params: Record<string, unknown>,
  logContext = "",
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) return true;

    const body = await res.text().catch(() => "<unreadable body>");
    console.error(`[telegram] ${method} failed${logContext} status=${res.status} body=${redact(body, token)}`);
    return false;
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
    console.error(`[telegram] ${method} error${logContext} ${redact(message, token)}`);
    return false;
  }
}

export function sendMessage(token: string, chatId: string, html: string): Promise<boolean> {
  return callTelegram(
    token,
    "sendMessage",
    { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true },
    ` chat=${chatId}`,
  );
}

/** Sends the message to every chat in parallel; one failure does not stop the others. */
export async function sendToAll(token: string, chatIds: string[], html: string): Promise<SendResult> {
  const results = await Promise.all(chatIds.map((chatId) => sendMessage(token, chatId, html)));
  const failed = results.filter((ok) => !ok).length;
  return { ok: failed === 0, failed, total: chatIds.length };
}
