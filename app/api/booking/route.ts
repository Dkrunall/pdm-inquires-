import { NextResponse, type NextRequest } from "next/server";
import { buildMessage, DEFAULT_FORM_NAME, valueToText } from "../../../lib/format";
import { readEnv, safeEqual } from "../../../lib/env";
import { sendToAll } from "../../../lib/telegram";

export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: JsonObject, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = readEnv("booking");
  if (!env) return json({ ok: false, error: "Server misconfigured" }, 500);

  const key = request.nextUrl.searchParams.get("key");
  if (!key || !safeEqual(key, env.webhookKey)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  if (!isObject(body)) return json({ ok: false, error: "Invalid payload" }, 400);

  if (body.triggerType !== undefined && body.triggerType !== "form_submission") {
    return json({ ok: true, ignored: true }, 200);
  }

  // V2 wraps everything in `payload`; V1 sends the fields at the top level.
  const source = isObject(body.payload) ? body.payload : body;
  const data = isObject(source.data) ? source.data : isObject(body.data) ? body.data : null;
  if (!data) return json({ ok: false, error: "No form data" }, 400);

  const formName = valueToText(source.name) ?? DEFAULT_FORM_NAME;
  const submittedAt = valueToText(source.submittedAt) ?? valueToText(source.d) ?? undefined;
  const submissionId = valueToText(source.id) ?? valueToText(source._id) ?? "unknown";

  console.log(`[booking] form="${formName}" id=${submissionId}`);

  const html = buildMessage({ formName, submittedAt, data });
  const result = await sendToAll(env.token, env.chatIds, html);
  if (!result.ok) {
    console.error(`[booking] telegram delivery failed for ${result.failed}/${result.total} chat(s) id=${submissionId}`);
    return json({ ok: false, error: "Telegram delivery failed" }, 502);
  }

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
