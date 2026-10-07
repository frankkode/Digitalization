/**
 * End to end tests of the To Be workflow on an in memory store.
 * They prove that the process runs from inquiry to onboarded client with only three
 * developer touches, and that the timer rules fire and cancel correctly.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { emptyDb, readDb, useMemoryStore } from "@/lib/store";
import { advanceClock } from "@/lib/clock";
import { approveQuote, availableSlots, bookCall, clientDecision, generateQuote, reviewInquiry, runDueTasks, signContract, submitInquiry } from "@/lib/workflow";
import { computeKpis } from "@/lib/kpi";

const form = {
  name: "Anna Lind",
  email: "anna@example.fi",
  company: "Skärgård Stay",
  projectType: "web_app",
  features: ["auth", "booking", "payments"],
  budgetBand: "15k_40k",
  deadlineWeeks: 12,
  description: "We run a small guesthouse in the archipelago and need a booking web app where guests can reserve rooms, pay online and receive confirmations automatically. Staff should log in and manage bookings.",
  consent: true,
};

async function toQuoteSent() {
  const r = await submitInquiry(form);
  if (!r.ok) throw new Error("submit failed");
  bookCall(r.inquiryId, availableSlots()[0]);
  const quote = generateQuote(r.inquiryId);
  approveQuote(r.inquiryId);
  return { id: r.inquiryId, token: quote.token };
}

beforeEach(() => useMemoryStore(emptyDb()));

describe("T6 happy path: inquiry to onboarded client", () => {
  it("runs end to end and pushes the deposit invoice to accounting", async () => {
    const { id, token } = await toQuoteSent();
    clientDecision(token, true);
    await signContract(token, "Anna Lind");

    const db = readDb();
    const inq = db.inquiries.find((i) => i.id === id)!;
    expect(inq.status).toBe("onboarded");
    expect(db.contracts[0].signatureHash).toHaveLength(64);
    expect(db.invoices[0].status).toBe("pushed");
    expect(db.invoices[0].amountNet).toBeCloseTo(db.quotes[0].totalNet * 0.3, 1);
    // acknowledgement is immediate: first response time of zero hours
    expect(computeKpis(db).firstResponseHoursAvg).toBe(0);
    // only call, quote approval (2 developer events per inquiry in this path) are manual
    expect(db.events.filter((e) => e.actor === "developer").map((e) => e.type)).toEqual(["call_completed", "quote_approved"]);
  });

  it("prevents double booking of a call slot", async () => {
    const a = await submitInquiry(form);
    const b = await submitInquiry({ ...form, email: "ben@example.fi" });
    if (!a.ok || !b.ok) throw new Error("submit failed");
    const slot = availableSlots()[0];
    bookCall(a.inquiryId, slot);
    expect(() => bookCall(b.inquiryId, slot)).toThrow(/taken/);
  });

  it("reuses one client record for repeated inquiries from the same email", async () => {
    await submitInquiry(form);
    await submitInquiry({ ...form, email: "ANNA@example.fi" });
    expect(readDb().clients).toHaveLength(1);
  });
});

describe("T7 follow up timers (event condition action)", () => {
  it("sends two reminders and expires the quote when the client never replies", async () => {
    const { id } = await toQuoteSent();
    advanceClock(3.1); runDueTasks();
    advanceClock(4);   runDueTasks();
    advanceClock(7.5); runDueTasks();
    const db = readDb();
    expect(db.outbox.filter((m) => m.kind === "reminder")).toHaveLength(2);
    expect(db.inquiries.find((i) => i.id === id)!.status).toBe("lost");
  });

  it("cancels pending timers once the client decides", async () => {
    const { token } = await toQuoteSent();
    clientDecision(token, true);
    advanceClock(15);
    const result = runDueTasks();
    expect(result.executed).toBe(0);
    expect(readDb().outbox.filter((m) => m.kind === "reminder")).toHaveLength(0);
  });
});

describe("T8 human in the loop and guards", () => {
  it("does not decline automatically; the developer confirms", async () => {
    const r = await submitInquiry({ ...form, projectType: "mobile_app", budgetBand: "under_2k", deadlineWeeks: 2, features: ["ai", "erp", "payments"], description: "Need an app very fast and cheap, details later please." });
    if (!r.ok) throw new Error("submit failed");
    expect(readDb().inquiries[0].status).toBe("needs_review");
    reviewInquiry(r.inquiryId, false);
    expect(readDb().inquiries[0].status).toBe("declined");
  });

  it("blocks invalid submissions and counts them for the data quality KPI", async () => {
    const r = await submitInquiry({ ...form, email: "wrong", consent: false });
    expect(r.ok).toBe(false);
    expect(computeKpis(readDb()).blockedInvalidSubmissions).toBe(1);
    expect(readDb().inquiries).toHaveLength(0);
  });

  it("refuses to send a quote that was not generated", async () => {
    const r = await submitInquiry(form);
    if (!r.ok) throw new Error("submit failed");
    expect(() => approveQuote(r.inquiryId)).toThrow(/not allowed/);
  });
});
