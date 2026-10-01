import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/telegram/route";
import { GET as setup } from "../app/api/telegram/setup/route";
import { FALLBACK_REPLY, parseCommand, replyFor } from "../lib/commands";
import { telegramSecret } from "../lib/env";

const KEY = "test-key";
const SUBSCRIBED = "111";

describe("parseCommand", () => {
  it.each([
    ["/start", "start"],
    ["/START", "start"],
    ["/start@pdm_inquries_bot", "start"],
    ["/start payload", "start"],
    ["  /id ", "id"],
    ["hello", null],
    ["/", null],
    ["please /help", null],
  ] as const)("%s → %s", (text, expected) => {
    expect(parseCommand(text)).toBe(expected);
  });
});

describe("replyFor", () => {
  it("tells a subscribed chat it receives enquiries", () => {
    expect(replyFor("/start", SUBSCRIBED, [SUBSCRIBED])).toContain("will arrive in this chat");
  });

  it("gives an unknown chat its ID to pass to the admin", () => {
    const reply = replyFor("/start", "999", [SUBSCRIBED]);
    expect(reply).toContain("not set up");
    expect(reply).toContain("<code>999</code>");
  });

  it("shows the chat ID for /id", () => {
    expect(replyFor("/id", SUBSCRIBED, [SUBSCRIBED])).toContain("<code>111</code>");
  });

  it("lists the commands for /help", () => {
    const reply = replyFor("/help", SUBSCRIBED, [SUBSCRIBED]);
    for (const cmd of ["/start", "/id", "/help"]) expect(reply).toContain(cmd);
  });

  it("refuses to chat", () => {
    expect(replyFor("hi there", SUBSCRIBED, [SUBSCRIBED])).toBe(FALLBACK_REPLY);
    expect(replyFor("/unknown", SUBSCRIBED, [SUBSCRIBED])).toBe(FALLBACK_REPLY);
    expect(replyFor("", SUBSCRIBED, [SUBSCRIBED])).toBe(FALLBACK_REPLY);
  });
});

const fetchMock = vi.fn<typeof fetch>();

function update(body: unknown, secret: string | null = telegramSecret(KEY)): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  return new NextRequest("http://localhost/api/telegram", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function privateMessage(text: string, chatId = 111) {
  return { update_id: 1, message: { message_id: 1, text, chat: { id: chatId, type: "private" } } };
}

function sentBodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

beforeEach(() => {
  vi.stubEnv("TG_TOKEN", "123:secret");
  vi.stubEnv("TG_CHAT_ID", SUBSCRIBED);
  vi.stubEnv("WEBHOOK_KEY", KEY);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{"ok":true}', { status: 200 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/telegram", () => {
  it("rejects requests without the right secret header", async () => {
    expect((await POST(update(privateMessage("/start"), null))).status).toBe(401);
    expect((await POST(update(privateMessage("/start"), "wrong"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replies to a command in a private chat", async () => {
    const res = await POST(update(privateMessage("/start")));
    expect(res.status).toBe(200);
    expect(sentBodies()).toEqual([
      expect.objectContaining({ chat_id: "111", parse_mode: "HTML", text: expect.stringContaining("will arrive") }),
    ]);
  });

  it("answers ordinary chat with the fallback reply", async () => {
    await POST(update(privateMessage("hello?")));
    expect(sentBodies()[0]?.text).toBe(FALLBACK_REPLY);
  });

  it("ignores group messages and non-message updates", async () => {
    const group = { update_id: 2, message: { text: "/start", chat: { id: -5, type: "group" } } };
    expect((await POST(update(group))).status).toBe(200);
    expect((await POST(update({ update_id: 3, edited_message: {} }))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still returns 200 if the reply fails, so Telegram does not retry", async () => {
    fetchMock.mockImplementation(async () => new Response("bad", { status: 400 }));
    expect((await POST(update(privateMessage("/id")))).status).toBe(200);
  });
});

describe("GET /api/telegram/setup", () => {
  it("requires the webhook key", async () => {
    const res = await setup(new NextRequest("https://app.example.com/api/telegram/setup?key=nope"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers the webhook with the derived secret and the command menu", async () => {
    const res = await setup(new NextRequest(`https://app.example.com/api/telegram/setup?key=${KEY}`));
    expect(res.status).toBe(200);
    const urls = fetchMock.mock.calls.map(([url]) => String(url).split("/").pop());
    expect(urls).toEqual(["setWebhook", "setMyCommands"]);
    const [webhook, commands] = sentBodies();
    expect(webhook).toMatchObject({
      url: "https://app.example.com/api/telegram",
      secret_token: telegramSecret(KEY),
    });
    expect(commands?.commands).toHaveLength(3);
  });
});
