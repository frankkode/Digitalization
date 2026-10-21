/**
 * Tests for the version 1.0 additions (T9 to T14, referenced in the Phase 3 report).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, toIcsDate } from "@/lib/automation/calendar";
import { createSession, safeEqual, verifySession } from "@/lib/auth";
import { allowRequest, resetRateLimit } from "@/lib/ratelimit";
import { deliverPending, MAX_ATTEMPTS, type MailTransport } from "@/lib/automation/mailer";
import { emptyDb, readDb, updateDb, useMemoryStore } from "@/lib/store";
import { advanceClock } from "@/lib/clock";
import { availableSlots, bookCall, clientDecision, generateQuote, approveQuote, purgeExpiredPersonalData, reviewInquiry, submitInquiry } from "@/lib/workflow";
import { inquiriesCsv } from "@/lib/kpi";

const form = {
  name: "Anna Lind", email: "anna@example.fi", company: "Skärgård Stay", projectType: "web_app",
  features: ["auth", "booking"], budgetBand: "15k_40k", deadlineWeeks: 12, consent: true,
  description: "We need a booking web app for our guesthouse where guests reserve rooms and pay online, and staff manage bookings.",
};

beforeEach(() => { useMemoryStore(emptyDb()); resetRateLimit(); });

describe("T9 calendar invitation (RFC 5545)", () => {
  it("formats UTC dates and escapes text values", () => {
    expect(toIcsDate("2026-10-01T06:00:00.000Z")).toBe("20261001T060000Z");
    expect(escapeText("Call; agenda, notes\nend")).toBe("Call\\; agenda\\, notes\\nend");
  });

  it("folds long lines to 75 octets with a leading space", () => {
    const folded = foldLine("DESCRIPTION:" + "x".repeat(200)).split("\r\n");
    expect(folded.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });

  it("produces a complete event that ends after the call length", () => {
    const ics = buildIcs({ uid: "a@b", start: "2026-10-01T06:00:00Z", durationMinutes: 30, summary: "Call", description: "Ref",
      organizerEmail: "o@x.fi", attendeeEmail: "c@y.fi", stampIso: "2026-09-30T10:00:00Z" });
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("DTEND:20261001T063000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("attaches the invitation to the booking confirmation", async () => {
    const r = await submitInquiry(form);
    if (!r.ok) throw new Error("submit failed");
    bookCall(r.inquiryId, availableSlots()[0]);
    const msg = readDb().outbox.find((m) => m.kind === "call_confirmation")!;
    expect(msg.attachment?.filename).toBe("discovery-call.ics");
    expect(msg.attachment?.content).toContain("ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:anna@example.fi");
  });
});

describe("T10 dashboard session", () => {
  it("accepts a valid session and rejects tampered or expired ones", async () => {
    const token = await createSession(1_000, "secret");
    expect(await verifySession(token, 2_000, "secret")).toBe(true);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "0" ? "1" : "0");          // change one signature character
    expect(await verifySession(tampered, 2_000, "secret")).toBe(false);
    expect(await verifySession(`9999999999999.${token.split(".")[1]}`, 2_000, "secret")).toBe(false);   // extended expiry
    expect(await verifySession(token, 2_000, "other secret")).toBe(false);
    expect(await verifySession(token, 1_000 + 9 * 3_600_000, "secret")).toBe(false);   // 8 h lifetime
  });

  it("compares strings in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("T11 rate limiting of the public form", () => {
  it("blocks the sixth request in ten minutes and allows it again later", () => {
    for (let i = 0; i < 5; i++) expect(allowRequest("1.2.3.4", 0)).toBe(true);
    expect(allowRequest("1.2.3.4", 1_000)).toBe(false);
    expect(allowRequest("5.6.7.8", 1_000)).toBe(true);           // other clients are not affected
    expect(allowRequest("1.2.3.4", 11 * 60_000)).toBe(true);     // window has passed
  });
});

describe("T12 email delivery (transactional outbox)", () => {
  it("marks messages as delivered once and does not send them twice", async () => {
    await submitInquiry(form);
    const sent: string[] = [];
    const transport: MailTransport = { name: "smtp", async send(m) { sent.push(m.subject); } };
    const first = await deliverPending(transport);
    const second = await deliverPending(transport);
    expect(first.delivered).toBeGreaterThan(0);
    expect(second.delivered).toBe(0);
    expect(readDb().outbox.every((m) => m.deliveredAt && m.transport === "smtp")).toBe(true);
  });

  it("retries failed messages up to the attempt limit", async () => {
    await submitInquiry(form);
    const failing: MailTransport = { name: "smtp", async send() { throw new Error("SMTP down"); } };
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await deliverPending(failing);
    const m = readDb().outbox[0];
    expect(m.attempts).toBe(MAX_ATTEMPTS);
    expect(m.deliveredAt).toBeUndefined();
    expect(m.lastError).toMatch(/SMTP down/);
  });
});

describe("T13 GDPR retention", () => {
  it("anonymizes a declined inquiry after 12 months but keeps recent ones", async () => {
    const r = await submitInquiry({ ...form, projectType: "mobile_app", budgetBand: "under_2k", deadlineWeeks: 2, features: ["ai", "erp", "payments"], description: "Need an app very fast and cheap, details later please." });
    if (!r.ok) throw new Error("submit failed");
    reviewInquiry(r.inquiryId, false);
    expect(updateDb((db) => purgeExpiredPersonalData(db))).toBe(0);
    advanceClock(370);
    expect(updateDb((db) => purgeExpiredPersonalData(db))).toBe(1);
    const db = readDb();
    expect(db.clients[0].email).toMatch(/^anonymized/);
    expect(db.inquiries[0].description).toMatch(/removed/);
  });

  it("never anonymizes clients with a signed contract", async () => {
    const r = await submitInquiry(form);
    if (!r.ok) throw new Error("submit failed");
    bookCall(r.inquiryId, availableSlots()[0]);
    const q = generateQuote(r.inquiryId);
    approveQuote(r.inquiryId);
    clientDecision(q.token, true);
    advanceClock(400);
    expect(updateDb((db) => purgeExpiredPersonalData(db))).toBe(0);
    expect(readDb().clients[0].email).toBe("anna@example.fi");
  });
});

describe("T14 KPI export", () => {
  it("writes one CSV row per inquiry with escaped values", async () => {
    await submitInquiry(form);
    await submitInquiry({ ...form, email: "ben@example.fi" });
    const lines = inquiriesCsv(readDb()).trim().split("\n");
    expect(lines[0]).toMatch(/^inquiry_id,created_at,project_type,score/);
    expect(lines).toHaveLength(3);
  });
});
