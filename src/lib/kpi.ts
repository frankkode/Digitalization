/**
 * KPI computation from the audit trail (Phase 1, Table 1).
 * Because every step writes an event with an actor, the KPIs are measured from real
 * process data instead of estimates.
 */
import { hoursBetween } from "./clock";
import type { Database } from "./types";

export interface KpiSnapshot {
  inquiries: number;
  firstResponseHoursAvg: number | null;     // P1
  cycleTimeDaysAvg: number | null;          // inquiry to signed contract
  conversionRate: number | null;            // accepted / decided quotes
  dataErrorRate: number;                    // incomplete records stored / all records
  blockedInvalidSubmissions: number;
  manualTouchesPerInquiry: number | null;   // developer actions (proxy for administrative time)
  automatedShare: number | null;            // system events / all process events
  remindersSent: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export function computeKpis(db: Database): KpiSnapshot {
  const firstResponse = db.inquiries.filter((i) => i.firstResponseAt).map((i) => hoursBetween(i.createdAt, i.firstResponseAt!));

  const cycle = db.inquiries.flatMap((i) => {
    const signed = db.events.find((e) => e.inquiryId === i.id && e.type === "contract_signed");
    return signed ? [hoursBetween(i.createdAt, signed.at) / 24] : [];
  });

  const decided = db.quotes.filter((q) => ["accepted", "rejected", "expired"].includes(q.status));
  const accepted = decided.filter((q) => q.status === "accepted").length;

  // a stored record is erroneous if a mandatory field is missing (validation should keep this at zero)
  const incomplete = db.inquiries.filter((i) => {
    const c = db.clients.find((x) => x.id === i.clientId);
    return !c || !c.email || !c.consentAt || !i.description || !i.budgetBand;
  }).length;

  const processEvents = db.events.filter((e) => e.actor !== "client");
  const developerEvents = processEvents.filter((e) => e.actor === "developer").length;

  return {
    inquiries: db.inquiries.length,
    firstResponseHoursAvg: r2(avg(firstResponse)),
    cycleTimeDaysAvg: r2(avg(cycle)),
    conversionRate: decided.length ? r2(accepted / decided.length) : null,
    dataErrorRate: db.inquiries.length ? r2(incomplete / db.inquiries.length)! : 0,
    blockedInvalidSubmissions: db.rejectedSubmissions,
    manualTouchesPerInquiry: db.inquiries.length ? r2(developerEvents / db.inquiries.length) : null,
    automatedShare: processEvents.length ? r2(1 - developerEvents / processEvents.length) : null,
    remindersSent: db.outbox.filter((m) => m.kind === "reminder").length,
  };
}
