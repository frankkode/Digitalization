/**
 * Workflow engine for the To Be process.
 *
 * Every public function corresponds to one event in the To Be BPMN model. Each step
 * validates the current state (a guard), performs the automated actions and writes an
 * audit event. The only manual steps left are the ones where judgment matters:
 * reviewing grey zone inquiries, holding the discovery call and approving the quote.
 */
import { AVAILABILITY, BUSINESS, FOLLOW_UP } from "./config";
import { addDays, nowIso } from "./clock";
import { newId, newToken, readDb, updateDb } from "./store";
import type { AuditEvent, Complexity, Database, Inquiry, OutboxMessage, Quote } from "./types";
import { validateIntake } from "./automation/validation";
import { qualify } from "./automation/qualification";
import { estimate } from "./automation/pricing";
import { summarize } from "./automation/summarizer";
import { buildDepositInvoice, mockAccounting, renderContract, signatureHash, type AccountingAdapter } from "./automation/documents";

export class WorkflowError extends Error {}

// ---------------------------------------------------------------- helpers
function log(db: Database, inquiryId: string, actor: AuditEvent["actor"], type: string, detail: string, at = nowIso()): void {
  db.events.push({ id: newId("evt"), inquiryId, at, actor, type, detail });
}

function send(db: Database, inquiryId: string, to: string, kind: OutboxMessage["kind"], subject: string, body: string, at = nowIso()): void {
  db.outbox.push({ id: newId("msg"), inquiryId, to, kind, subject, body, createdAt: at });
}

function findInquiry(db: Database, id: string): Inquiry {
  const inq = db.inquiries.find((i) => i.id === id);
  if (!inq) throw new WorkflowError(`Inquiry ${id} not found`);
  return inq;
}

function requireStatus(inq: Inquiry, allowed: Inquiry["status"][]): void {
  if (!allowed.includes(inq.status)) throw new WorkflowError(`Action not allowed in status ${inq.status}`);
}

function clientOf(db: Database, inq: Inquiry) {
  const c = db.clients.find((x) => x.id === inq.clientId);
  if (!c) throw new WorkflowError("Client record missing");
  return c;
}

// ---------------------------------------------------------------- 1 intake (P1, P2)
export type SubmitResult = { ok: true; inquiryId: string } | { ok: false; errors: Record<string, string> };

export async function submitInquiry(raw: unknown): Promise<SubmitResult> {
  const v = validateIntake(raw);
  if (!v.ok) {
    updateDb((db) => { db.rejectedSubmissions += 1; });
    return { ok: false, errors: v.errors };
  }
  const input = v.data;
  const qualification = qualify(input);
  const aiSummary = await summarize(input);   // async call outside the write lock
  const at = nowIso();

  const inquiryId = updateDb((db) => {
    // one client record per email address: data is entered once and reused (P2)
    let client = db.clients.find((c) => c.email === input.email);
    if (!client) {
      client = { id: newId("cli"), name: input.name, email: input.email, company: input.company || undefined, consentAt: at, createdAt: at };
      db.clients.push(client);
    }
    const inq: Inquiry = {
      id: newId("inq"), clientId: client.id, projectType: input.projectType, features: input.features,
      budgetBand: input.budgetBand, deadlineWeeks: input.deadlineWeeks, description: input.description,
      status: "received", qualification, aiSummary, createdAt: at, firstResponseAt: at,
    };
    db.inquiries.push(inq);
    log(db, inq.id, "client", "inquiry_submitted", `Portal form, ${input.features.length} features`, at);
    send(db, inq.id, client.email, "acknowledgement", "We received your inquiry",
      `Hello ${client.name}, thank you for contacting Nordiso. Your request ${inq.id} is registered.`, at);
    log(db, inq.id, "system", "acknowledged", "Automatic acknowledgement sent", at);
    log(db, inq.id, "system", "qualified_scored", `Score ${qualification.score} (${qualification.decision})`, at);

    // routing rule: only clear cases proceed automatically
    if (qualification.decision === "qualified") {
      inq.status = "qualified";
      send(db, inq.id, client.email, "booking_link", "Choose a time for a short discovery call",
        `Please pick a slot: /book/${inq.id}`, at);
      log(db, inq.id, "system", "booking_link_sent", "Self service booking link sent", at);
    } else {
      inq.status = "needs_review";
      log(db, inq.id, "system", "review_requested", qualification.reasons.join("; "), at);
    }
    return inq.id;
  });
  return { ok: true, inquiryId };
}

/** Developer decision for grey zone or decline suggestions (human in the loop). */
export function reviewInquiry(inquiryId: string, accept: boolean): void {
  updateDb((db) => {
    const inq = findInquiry(db, inquiryId);
    requireStatus(inq, ["needs_review"]);
    const client = clientOf(db, inq);
    if (accept) {
      inq.status = "qualified";
      send(db, inq.id, client.email, "booking_link", "Choose a time for a short discovery call", `Please pick a slot: /book/${inq.id}`);
      log(db, inq.id, "developer", "review_accepted", "Developer accepted the inquiry");
    } else {
      inq.status = "declined";
      inq.closedAt = nowIso();
      send(db, inq.id, client.email, "decline", "Regarding your inquiry", `Hello ${client.name}, unfortunately we cannot take on this project right now.`);
      log(db, inq.id, "developer", "review_declined", "Developer declined; polite decline sent");
    }
  });
}

// ---------------------------------------------------------------- 2 self service booking (P3)
export function availableSlots(fromIso = nowIso()): string[] {
  const slots: string[] = [];
  const start = new Date(fromIso);
  const booked = new Set(readDb().inquiries.map((i) => i.callSlot).filter(Boolean));
  for (let d = 1; d <= AVAILABILITY.daysAhead; d++) {
    const day = new Date(start.getTime() + d * 86_400_000);
    if (!(AVAILABILITY.weekdays as readonly number[]).includes(day.getUTCDay())) continue;
    for (const h of AVAILABILITY.hoursLocal) {
      const slot = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h - 3)).toISOString(); // Helsinki UTC+3
      if (!booked.has(slot)) slots.push(slot);
    }
  }
  return slots;
}

export function bookCall(inquiryId: string, slotIso: string): void {
  updateDb((db) => {
    const inq = findInquiry(db, inquiryId);
    requireStatus(inq, ["qualified"]);
    if (db.inquiries.some((i) => i.callSlot === slotIso)) throw new WorkflowError("Slot already taken");
    inq.callSlot = slotIso;
    inq.status = "call_booked";
    const client = clientOf(db, inq);
    send(db, inq.id, client.email, "call_confirmation", "Discovery call confirmed", `Your call is booked for ${slotIso} (calendar invitation attached).`);
    log(db, inq.id, "client", "call_booked", `Slot ${slotIso}`);
  });
}

// ---------------------------------------------------------------- 3 assisted quotation (P4)
/** After the call the developer confirms complexity; the draft quote is generated automatically. */
export function generateQuote(inquiryId: string, complexity?: Complexity): Quote {
  return updateDb((db) => {
    const inq = findInquiry(db, inquiryId);
    requireStatus(inq, ["call_booked", "quote_draft"]);
    if (inq.status === "call_booked") log(db, inq.id, "developer", "call_completed", "Discovery call held; complexity confirmed");
    const level = complexity ?? inq.aiSummary?.suggestedComplexity ?? "medium";
    const est = estimate(inq.projectType, inq.features, level);
    // regenerating replaces an earlier draft
    db.quotes = db.quotes.filter((q) => !(q.inquiryId === inq.id && q.status === "draft"));
    const quote: Quote = {
      id: newId("q"), inquiryId: inq.id, token: newToken(), lines: est.lines, complexity: level,
      expectedHours: est.expectedHours, standardDeviation: est.standardDeviation, quotedHours: est.quotedHours,
      hourlyRate: BUSINESS.hourlyRate, totalNet: est.totalNet, vatRate: BUSINESS.vatRate, totalGross: est.totalGross,
      depositRate: BUSINESS.depositRate, status: "draft", createdAt: nowIso(),
    };
    db.quotes.push(quote);
    inq.quoteId = quote.id;
    inq.status = "quote_draft";
    log(db, inq.id, "system", "quote_generated", `PERT estimate ${est.quotedHours} h, EUR ${est.totalNet} net (${level})`);
    return quote;
  });
}

/** Human approval gate before anything is sent to the client; schedules the follow up timers (P5). */
export function approveQuote(inquiryId: string): void {
  updateDb((db) => {
    const inq = findInquiry(db, inquiryId);
    requireStatus(inq, ["quote_draft"]);
    const quote = db.quotes.find((q) => q.id === inq.quoteId)!;
    const at = nowIso();
    quote.status = "sent";
    quote.sentAt = at;
    inq.status = "quote_sent";
    const client = clientOf(db, inq);
    send(db, inq.id, client.email, "quote", "Your quote from Nordiso", `View and accept online: /quote/${quote.token}`, at);
    log(db, inq.id, "developer", "quote_approved", "Developer approved and sent the quote", at);
    // event condition action rules: ON quote_sent DO schedule timers
    db.tasks.push(
      { id: newId("tsk"), inquiryId: inq.id, kind: "reminder_1", dueAt: addDays(at, FOLLOW_UP.reminder1Days), status: "pending" },
      { id: newId("tsk"), inquiryId: inq.id, kind: "reminder_2", dueAt: addDays(at, FOLLOW_UP.reminder2Days), status: "pending" },
      { id: newId("tsk"), inquiryId: inq.id, kind: "expire_quote", dueAt: addDays(at, FOLLOW_UP.expireDays), status: "pending" },
    );
    log(db, inq.id, "system", "timers_scheduled", `Reminders at +${FOLLOW_UP.reminder1Days} and +${FOLLOW_UP.reminder2Days} days, expiry at +${FOLLOW_UP.expireDays} days`, at);
  });
}

// ---------------------------------------------------------------- 4 automated follow up (P5)
/**
 * Scheduler run (called by a cron job in production, by a button in the demo).
 * Rule: WHEN a timer is due AND the quote is still open THEN act; otherwise cancel it.
 */
export function runDueTasks(at = nowIso()): { executed: number; cancelled: number } {
  return updateDb((db) => {
    let executed = 0;
    let cancelled = 0;
    for (const task of db.tasks.filter((t) => t.status === "pending" && t.dueAt <= at)) {
      const inq = findInquiry(db, task.inquiryId);
      const quote = db.quotes.find((q) => q.id === inq.quoteId);
      if (!quote || quote.status !== "sent") { task.status = "cancelled"; cancelled++; continue; }
      const client = clientOf(db, inq);
      if (task.kind === "expire_quote") {
        quote.status = "expired";
        inq.status = "lost";
        inq.closedAt = at;
        send(db, inq.id, client.email, "lost", "Your quote has expired", "The quote has expired. Reply any time if you want an updated offer.", at);
        log(db, inq.id, "system", "quote_expired", "No reply within the validity period; marked as lost", at);
      } else {
        send(db, inq.id, client.email, "reminder", "Friendly reminder about your quote", `Your quote is waiting: /quote/${quote.token}`, at);
        log(db, inq.id, "system", task.kind, "Automatic reminder sent", at);
      }
      task.status = "done";
      executed++;
    }
    return { executed, cancelled };
  });
}

// ---------------------------------------------------------------- 5 contract to cash (P6, P7)
export function clientDecision(token: string, accept: boolean): void {
  updateDb((db) => {
    const quote = db.quotes.find((q) => q.token === token);
    if (!quote) throw new WorkflowError("Quote not found");
    if (quote.status !== "sent") throw new WorkflowError(`Quote is ${quote.status}`);
    const inq = findInquiry(db, quote.inquiryId);
    const at = nowIso();
    quote.decidedAt = at;
    db.tasks.filter((t) => t.inquiryId === inq.id && t.status === "pending").forEach((t) => { t.status = "cancelled"; });
    if (!accept) {
      quote.status = "rejected";
      inq.status = "lost";
      inq.closedAt = at;
      log(db, inq.id, "client", "quote_rejected", "Client rejected the quote", at);
      return;
    }
    quote.status = "accepted";
    inq.status = "accepted";
    const client = clientOf(db, inq);
    db.contracts.push({ id: newId("con"), quoteId: quote.id, body: renderContract(client, quote, at) });
    log(db, inq.id, "client", "quote_accepted", "Client accepted online", at);
    log(db, inq.id, "system", "contract_generated", "Contract generated from the current template", at);
  });
}

export async function signContract(token: string, signerName: string, accounting: AccountingAdapter = mockAccounting): Promise<void> {
  if (signerName.trim().length < 2) throw new WorkflowError("Please type your full name to sign");
  const prepared = updateDb((db) => {
    const quote = db.quotes.find((q) => q.token === token);
    if (!quote) throw new WorkflowError("Quote not found");
    const inq = findInquiry(db, quote.inquiryId);
    requireStatus(inq, ["accepted"]);
    const contract = db.contracts.find((c) => c.quoteId === quote.id)!;
    const at = nowIso();
    contract.signedName = signerName.trim();
    contract.signedAt = at;
    contract.signatureHash = signatureHash(contract.body, contract.signedName, at);
    inq.status = "signed";
    const client = clientOf(db, inq);
    send(db, inq.id, client.email, "contract", "Signed agreement", `Signed by ${contract.signedName}, hash ${contract.signatureHash.slice(0, 16)}...`, at);
    log(db, inq.id, "client", "contract_signed", `Electronic signature, hash ${contract.signatureHash.slice(0, 12)}`, at);
    return { client, quote, contractId: contract.id, inquiryId: inq.id, at };
  });

  // invoice data flows from the client record to accounting without retyping (P7)
  const { invoice, payload } = buildDepositInvoice(prepared.client, prepared.quote, prepared.contractId, prepared.at);
  const { externalId } = await accounting.pushInvoice(payload);
  updateDb((db) => {
    db.invoices.push({ ...invoice, id: newId("inv"), externalId, status: "pushed" });
    const inq = findInquiry(db, prepared.inquiryId);
    inq.status = "onboarded";
    inq.closedAt = prepared.at;
    send(db, inq.id, prepared.client.email, "invoice", "Deposit invoice", `Invoice ${externalId}: EUR ${invoice.amountGross.toFixed(2)} due ${invoice.dueDate}`);
    log(db, inq.id, "system", "invoice_pushed", `Deposit invoice ${externalId} sent to accounting API`);
    log(db, inq.id, "system", "workspace_created", "Project workspace and task board created from template");
  });
}
