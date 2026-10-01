import { describe, expect, it } from "vitest";
import {
  buildMessage,
  detectFieldType,
  escapeHtml,
  formatIST,
  matchFields,
  normalisePhone,
  truncate,
} from "../lib/format";

describe("normalisePhone", () => {
  it.each(["98765 43210", "098765 43210", "+91-98765-43210", "+91 9876543210", "919876543210"])(
    "normalises %s to 919876543210",
    (input) => {
      expect(normalisePhone(input)).toBe("919876543210");
    },
  );

  it("keeps valid international numbers as typed", () => {
    expect(normalisePhone("+44 20 7946 0958")).toBe("442079460958");
    expect(normalisePhone("+1 (415) 555-2671")).toBe("14155552671");
  });

  it("rejects numbers that are too short or too long", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("call me")).toBeNull();
    expect(normalisePhone("1234567890123456")).toBeNull();
  });
});

describe("field matching", () => {
  it.each([
    ["Email-id", "email"],
    ["email_id", "email"],
    ["Email id", "email"],
    ["Phone number", "phone"],
    ["Mobile", "phone"],
    ["WhatsApp No", "phone"],
    ["Message/Inquiry", "message"],
    ["Enquiry", "message"],
    ["Full Name", "name"],
    ["Guests", null],
  ] as const)("%s → %s", (key, expected) => {
    expect(detectFieldType(key)).toBe(expected);
  });

  it("uses each type once and keeps later matches as extra fields", () => {
    const { known, extra } = matchFields({
      "Full Name": "Rahul",
      "Email-id": "rahul@example.com",
      email_id: "second@example.com",
      "Phone number": "98765 43210",
      Guests: "6",
    });
    expect(known).toEqual({
      name: "Rahul",
      email: "rahul@example.com",
      phone: "98765 43210",
    });
    expect(extra).toEqual([
      { label: "email_id", value: "second@example.com" },
      { label: "Guests", value: "6" },
    ]);
  });

  it("skips empty values", () => {
    const { known, extra } = matchFields({ Name: "  ", Email: "", Notes: null, Other: "" });
    expect(known).toEqual({});
    expect(extra).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("escapes tags, ampersands and quotes", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; 'y'",
    );
  });

  it("escapes user input inside the built message", () => {
    const html = buildMessage({
      formName: "Form <b>",
      data: { Name: `<script>alert(1)</script>`, Message: `Fish & "chips"` },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Fish &amp; &quot;chips&quot;");
    expect(html).toContain("New Enquiry — Form &lt;b&gt;");
  });

  it("does not turn an email with quotes into a broken link", () => {
    const html = buildMessage({ data: { Email: `a"><b>x@y.com` } });
    expect(html).not.toContain("mailto:");
    expect(html).toContain("a&quot;&gt;&lt;b&gt;x@y.com");
  });
});

describe("truncate", () => {
  it("cuts values over 500 characters and appends an ellipsis", () => {
    const result = truncate("a".repeat(600));
    expect(result).toBe("a".repeat(500) + "…");
    expect(truncate("short")).toBe("short");
  });
});

describe("formatIST", () => {
  it("converts UTC to Asia/Kolkata", () => {
    expect(formatIST("2026-10-01T14:32:10.000Z")).toBe("1 Oct 2026, 8:02 PM IST");
    expect(formatIST("2026-10-01T00:00:00.000Z")).toBe("1 Oct 2026, 5:30 AM IST");
  });

  it("falls back to the current time when missing or invalid", () => {
    const now = new Date("2026-01-15T06:30:00.000Z");
    expect(formatIST(undefined, now)).toBe("15 Jan 2026, 12:00 PM IST");
    expect(formatIST("not a date", now)).toBe("15 Jan 2026, 12:00 PM IST");
  });
});

describe("buildMessage", () => {
  const sample = {
    formName: "Enquiry Form",
    submittedAt: "2026-10-01T14:32:10.000Z",
    data: {
      Name: "Rahul Sharma",
      "Email-id": "rahul@example.com",
      "Phone-number": "+91 98765 43210",
      "Message-Inquiry": "Looking to book a table for 6 this Saturday",
    },
  };

  it("builds the full message in the expected order", () => {
    expect(buildMessage(sample)).toBe(
      [
        "📩 <b>New Enquiry — Enquiry Form</b>",
        "",
        "👤 <b>Name:</b> Rahul Sharma",
        "📞 <b>Phone:</b> +91 98765 43210",
        '✉️ <b>Email:</b> <a href="mailto:rahul@example.com">rahul@example.com</a>',
        "💬 <b>Message:</b> Looking to book a table for 6 this Saturday",
        "",
        "🕒 <b>Received:</b> 1 Oct 2026, 8:02 PM IST",
        '💚 <b>WhatsApp:</b> <a href="https://wa.me/919876543210">https://wa.me/919876543210</a>',
      ].join("\n"),
    );
  });

  it("skips the Message line when the message is empty", () => {
    const html = buildMessage({ ...sample, data: { ...sample.data, "Message-Inquiry": "   " } });
    expect(html).not.toContain("Message:");
    expect(html).toContain("Name:");
  });

  it("puts unknown fields at the end with a bullet", () => {
    const html = buildMessage({ ...sample, data: { ...sample.data, Guests: "6" } });
    expect(html).toContain("💬 <b>Message:</b> Looking to book a table for 6 this Saturday\n• <b>Guests:</b> 6");
  });

  it("defaults the form name and omits WhatsApp without a usable phone", () => {
    const html = buildMessage({ data: { Name: "A", Phone: "123" } });
    expect(html).toContain("New Enquiry — Website");
    expect(html).toContain("📞 <b>Phone:</b> 123");
    expect(html).not.toContain("WhatsApp");
  });
});
