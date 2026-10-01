import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/booking/route";

const KEY = "test-key";

const samplePayload = {
  triggerType: "form_submission",
  payload: {
    name: "Enquiry Form",
    siteId: "site",
    data: { Name: "Rahul Sharma", "Email-id": "rahul@example.com", "Phone-number": "+91 98765 43210" },
    submittedAt: "2026-10-01T14:32:10.000Z",
    id: "sub-1",
    formId: "form-1",
  },
};

function post(body: string, key: string | null = KEY): NextRequest {
  const url = new URL("http://localhost/api/booking");
  if (key !== null) url.searchParams.set("key", key);
  return new NextRequest(url, { method: "POST", body, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("TG_TOKEN", "123:secret");
  vi.stubEnv("TG_CHAT_ID", "-1001, -1002");
  vi.stubEnv("WEBHOOK_KEY", KEY);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/booking", () => {
  it("returns 401 for a missing or wrong key without calling Telegram", async () => {
    expect((await POST(post(JSON.stringify(samplePayload), null))).status).toBe(401);
    expect((await POST(post(JSON.stringify(samplePayload), "wrong"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    expect((await POST(post("{not json"))).status).toBe(400);
  });

  it("ignores other trigger types", async () => {
    const res = await POST(post(JSON.stringify({ triggerType: "site_publish", payload: {} })));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to every chat id and returns ok", async () => {
    const res = await POST(post(JSON.stringify(samplePayload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sentChats = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).chat_id);
    expect(sentChats).toEqual(["-1001", "-1002"]);
  });

  it("accepts the V1 payload format", async () => {
    const v1 = { name: "Old Form", data: { Name: "Asha" }, d: "2026-10-01T14:32:10.000Z", _id: "x" };
    expect((await POST(post(JSON.stringify(v1)))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 502 if any send fails, but still attempts the others", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"ok":false,"description":"chat not found"}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const res = await POST(post(JSON.stringify(samplePayload)));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when an env variable is missing", async () => {
    vi.stubEnv("TG_TOKEN", "");
    const res = await POST(post(JSON.stringify(samplePayload)));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Server misconfigured" });
  });

  it("never logs personal data or secrets", async () => {
    fetchMock.mockResolvedValue(new Response("Unauthorized 123:secret", { status: 401 }));
    await POST(post(JSON.stringify(samplePayload)));
    const logged = [
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ].flat().join("\n");
    for (const secret of ["123:secret", KEY, "Rahul", "rahul@example.com", "98765"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("GET /api/booking", () => {
  it("returns 405", () => {
    expect(GET().status).toBe(405);
  });
});
