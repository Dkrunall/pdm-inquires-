// ---------------------------------------------------------------------------
// FIELD MATCHING CONFIG — edit this if your Webflow input names differ.
//
// Incoming field names are normalised (lowercased, everything except a-z/0-9
// removed), so "Email-id", "Email id" and "email_id" all become "emailid".
// Rules are checked top to bottom; the first rule whose keywords appear in the
// normalised name decides the field's type. Each type is used once: later
// fields that match an already-used type are shown as extra "•" fields.
// ---------------------------------------------------------------------------
export const FIELD_RULES = [
  { type: "email", keywords: ["email", "mail"] },
  { type: "phone", keywords: ["phone", "mobile", "contact", "whatsapp"] },
  // "field": the Peninsula site's message textarea is named "Field" in the Designer.
  { type: "message", keywords: ["message", "inquiry", "enquiry", "note", "comment", "field"] },
  { type: "name", keywords: ["name"] },
] as const;

export const MAX_FIELD_LENGTH = 500;
export const DEFAULT_FORM_NAME = "Website";

export type FieldType = (typeof FIELD_RULES)[number]["type"];

export interface ExtraField {
  label: string;
  value: string;
}

export interface MatchedFields {
  known: Partial<Record<FieldType, string>>;
  extra: ExtraField[];
}

export interface EnquiryInput {
  formName?: string;
  submittedAt?: string;
  data: Record<string, unknown>;
}

export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectFieldType(key: string): FieldType | null {
  const normalised = normaliseKey(key);
  for (const rule of FIELD_RULES) {
    if (rule.keywords.some((keyword) => normalised.includes(keyword))) {
      return rule.type;
    }
  }
  return null;
}

/** Turns a submitted value into display text, or null if it is empty. */
export function valueToText(value: unknown): string | null {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else if (Array.isArray(value)) {
    text = value
      .map((item) => valueToText(item))
      .filter((item): item is string => item !== null)
      .join(", ");
  } else {
    return null;
  }
  text = text.trim();
  return text === "" ? null : text;
}

export function matchFields(data: Record<string, unknown>): MatchedFields {
  const known: Partial<Record<FieldType, string>> = {};
  const extra: ExtraField[] = [];

  for (const [label, rawValue] of Object.entries(data)) {
    const value = valueToText(rawValue);
    if (value === null) continue;

    const type = detectFieldType(label);
    if (type !== null && known[type] === undefined) {
      known[type] = value;
    } else {
      extra.push({ label, value });
    }
  }

  return { known, extra };
}

/** Escapes text for Telegram HTML, safe in both element content and attributes. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function truncate(text: string, max: number = MAX_FIELD_LENGTH): string {
  const chars = Array.from(text); // avoid splitting emoji / surrogate pairs
  return chars.length > max ? chars.slice(0, max).join("") + "…" : text;
}

/**
 * Returns digits suitable for a wa.me link, or null if the number is unusable.
 * Indian numbers are normalised to 91XXXXXXXXXX.
 */
export function normalisePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/** Formats a date as e.g. "1 Oct 2026, 8:02 PM IST". Falls back to now if missing/invalid. */
export function formatIST(submittedAt?: string, now: Date = new Date()): string {
  let date = submittedAt ? new Date(submittedAt) : now;
  if (Number.isNaN(date.getTime())) date = now;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()} IST`;
}

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function line(emoji: string, label: string, valueHtml: string): string {
  return `${emoji} <b>${escapeHtml(label)}:</b> ${valueHtml}`;
}

function text(value: string): string {
  return escapeHtml(truncate(value));
}

export function buildMessage(input: EnquiryInput): string {
  const formName = valueToText(input.formName) ?? DEFAULT_FORM_NAME;
  const { known, extra } = matchFields(input.data);

  const fieldLines: string[] = [];
  if (known.name) fieldLines.push(line("👤", "Name", text(known.name)));
  if (known.phone) fieldLines.push(line("📞", "Phone", text(known.phone)));
  if (known.email) {
    const email = truncate(known.email);
    const emailHtml = EMAIL_PATTERN.test(email)
      ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      : escapeHtml(email);
    fieldLines.push(line("✉️", "Email", emailHtml));
  }
  if (known.message) fieldLines.push(line("💬", "Message", text(known.message)));
  for (const field of extra) {
    fieldLines.push(`• <b>${text(field.label)}:</b> ${text(field.value)}`);
  }

  const footerLines = [line("🕒", "Received", escapeHtml(formatIST(input.submittedAt)))];
  const waNumber = known.phone ? normalisePhone(known.phone) : null;
  if (waNumber) {
    const url = `https://wa.me/${waNumber}`;
    footerLines.push(line("💚", "WhatsApp", `<a href="${url}">${url}</a>`));
  }

  const sections = [`📩 <b>New Enquiry — ${text(formName)}</b>`];
  if (fieldLines.length > 0) sections.push(fieldLines.join("\n"));
  sections.push(footerLines.join("\n"));
  return sections.join("\n\n");
}
