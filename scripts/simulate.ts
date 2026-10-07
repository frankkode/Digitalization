/**
 * Discrete time simulation of the To Be process (testing and evaluation evidence).
 *
 * 60 synthetic inquiries arrive over 30 days and run through the *real* workflow engine
 * on an in memory store. Client behaviour is random but seeded (reproducible):
 *   booking delay 0.2 to 3 days; after the quote 45 % accept, 20 % reject and
 *   35 % stay silent (some of them answer after a reminder).
 * The developer holds the call at the booked slot and approves the quote within half a day.
 * Output: results/simulation.json and results/simulation.csv with KPI values per run.
 */
import fs from "node:fs";
import path from "node:path";
import { emptyDb, readDb, updateDb, useMemoryStore } from "../src/lib/store";
import { advanceClock, nowIso } from "../src/lib/clock";
import { approveQuote, availableSlots, bookCall, clientDecision, generateQuote, reviewInquiry, runDueTasks, signContract, submitInquiry } from "../src/lib/workflow";
import { computeKpis } from "../src/lib/kpi";

// ---------------------------------------------------------------- seeded random numbers (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261001);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => a + rand() * (b - a);

const TYPES = ["website", "web_app", "integration", "consulting", "mobile_app"];
const BUDGETS = ["under_2k", "2k_5k", "5k_15k", "15k_40k", "over_40k"];
const FEATURE_KEYS = ["cms", "auth", "payments", "booking", "multilingual", "erp", "dashboard", "ai"];
const TEXTS = [
  "We need a modern website for our local business with news we can edit ourselves and a contact form for customers in Finnish and Swedish.",
  "Our team wants a web application to manage bookings, customer data and invoices in one place, replacing several spreadsheets that we use today.",
  "Please connect our webshop with the accounting system so that orders and invoices are transferred automatically without typing them again.",
  "An app for our members.",
  "We would like advice on data protection and cloud tools for a small office with six people and a limited budget this year.",
];

type Plan = { id: string; token?: string; bookAt?: number; callAt?: number; approveAt?: number; decideAt?: number; decision?: "accept" | "reject" | "silent"; done?: boolean };

async function run(): Promise<void> {
  useMemoryStore(emptyDb());
  const STEP = 0.25;                 // simulation step in days
  const plans: Plan[] = [];
  let t = 0;                          // simulated day counter

  for (let step = 0; t < 60; step++, t += STEP) {
    // arrivals: 60 inquiries spread over the first 30 days (plus a few invalid forms)
    if (t < 30 && step % 2 === 0) {
      const valid = rand() > 0.07;
      const r = await submitInquiry({
        name: `Client ${plans.length + 1}`,
        email: valid ? `client${plans.length + 1}@example.fi` : "missing-at-sign",
        projectType: pick(TYPES),
        features: FEATURE_KEYS.filter(() => rand() < 0.3),
        budgetBand: pick(BUDGETS),
        deadlineWeeks: Math.round(between(2, 20)),
        description: pick(TEXTS),
        consent: valid,
      });
      if (r.ok) {
        const inq = readDb().inquiries.find((i) => i.id === r.inquiryId)!;
        // grey zone: the developer reviews within half a day and accepts two out of three
        if (inq.status === "needs_review") {
          if (rand() < 0.66) reviewInquiry(inq.id, true); else reviewInquiry(inq.id, false);
        }
        plans.push({ id: r.inquiryId, bookAt: t + between(0.2, 3) });
      }
    }

    for (const p of plans.filter((x) => !x.done)) {
      const inq = readDb().inquiries.find((i) => i.id === p.id)!;
      if (["declined", "lost", "onboarded"].includes(inq.status)) { p.done = true; continue; }
      if (inq.status === "qualified" && p.bookAt! <= t) {
        const slot = availableSlots()[0];
        bookCall(p.id, slot);
        p.callAt = t + (new Date(slot).getTime() - new Date(nowIso()).getTime()) / 86_400_000;
      }
      if (inq.status === "call_booked" && p.callAt! <= t) {
        p.token = generateQuote(p.id).token;       // after the call
        p.approveAt = t + between(0.1, 0.5);
      }
      if (inq.status === "quote_draft" && p.approveAt! <= t) {
        approveQuote(p.id);
        const u = rand();
        p.decision = u < 0.45 ? "accept" : u < 0.65 ? "reject" : "silent";
        // silent clients: half of them react to the day 7 reminder and accept
        p.decideAt = p.decision === "silent" ? (rand() < 0.5 ? t + between(7.2, 9) : Infinity) : t + between(1, 10);
        if (p.decision === "silent" && p.decideAt !== Infinity) p.decision = "accept";
      }
      if (inq.status === "quote_sent" && p.decideAt! <= t) {
        clientDecision(p.token!, p.decision === "accept");
        if (p.decision === "accept") await signContract(p.token!, "Simulated Client");
      }
    }
    advanceClock(STEP);
    runDueTasks();
  }

  const db = readDb();
  const k = computeKpis(db);
  const status = db.inquiries.reduce<Record<string, number>>((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {});
  const devActions = db.events.filter((e) => e.actor === "developer").reduce<Record<string, number>>((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {});
  const cycleDays = db.inquiries.flatMap((i) => {
    const s = db.events.find((e) => e.inquiryId === i.id && e.type === "contract_signed");
    return s ? [Math.round(((new Date(s.at).getTime() - new Date(i.createdAt).getTime()) / 86_400_000) * 10) / 10] : [];
  });
  const lateAccepts = db.inquiries.filter((i) => i.status === "onboarded" && db.events.some((e) => e.inquiryId === i.id && e.type === "reminder_2")).length;

  const result = {
    seed: 20261001, inquiriesValid: db.inquiries.length, invalidBlocked: db.rejectedSubmissions,
    statusCounts: status, developerActions: devActions, kpis: k, cycleDays,
    wonAfterReminder: lateAccepts, messagesSent: db.outbox.length,
    timersCancelled: db.tasks.filter((x) => x.status === "cancelled").length,
    timersExecuted: db.tasks.filter((x) => x.status === "done").length,
  };
  const out = path.join(process.cwd(), "results");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "simulation.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(out, "simulation.csv"), "metric,value\n" + Object.entries(k).map(([a, b]) => `${a},${b}`).join("\n") + "\n");
  console.log(JSON.stringify(result, null, 2));
}

run();
