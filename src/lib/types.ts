/**
 * Domain model for the automated client intake process (To Be).
 *
 * One central client record (P2) links every artefact of the process:
 * inquiry, qualification result, AI summary, quote, contract and invoice.
 * All timestamps are ISO 8601 strings so the JSON store stays portable.
 */

export type ProjectType = "website" | "web_app" | "mobile_app" | "integration" | "consulting";
export type BudgetBand = "under_2k" | "2k_5k" | "5k_15k" | "15k_40k" | "over_40k";
export type Complexity = "low" | "medium" | "high";

/** Pipeline states of an inquiry; they mirror the lanes of the To Be BPMN model. */
export type InquiryStatus =
  | "received"          // form submitted, acknowledgement sent automatically
  | "needs_review"      // qualification score in the grey zone, developer decides
  | "qualified"         // score above threshold, booking link sent
  | "call_booked"       // client selected a discovery call slot
  | "quote_draft"       // quote generated, waiting for developer approval
  | "quote_sent"        // quote approved and sent, follow up timers running
  | "accepted"          // client accepted, contract generated
  | "signed"            // contract signed electronically
  | "onboarded"         // deposit invoice pushed to accounting
  | "declined"          // not a fit, polite decline sent after human confirmation
  | "lost";             // client rejected or no reply after the final reminder

export interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  /** GDPR: moment of explicit consent to process the inquiry data. */
  consentAt: string;
  createdAt: string;
}

export interface ScoreBreakdown {
  serviceFit: number;
  budgetFit: number;
  scopeClarity: number;
  deadlineFit: number;
}

export interface QualificationResult {
  score: number;
  breakdown: ScoreBreakdown;
  decision: "qualified" | "needs_review" | "decline_suggested";
  reasons: string[];
}

export interface AiSummary {
  summary: string;
  keyRequirements: string[];
  risks: string[];
  suggestedComplexity: Complexity;
  source: "claude" | "mock";
}

export interface Inquiry {
  id: string;
  clientId: string;
  projectType: ProjectType;
  features: string[];
  budgetBand: BudgetBand;
  deadlineWeeks: number;
  description: string;
  status: InquiryStatus;
  qualification?: QualificationResult;
  aiSummary?: AiSummary;
  callSlot?: string;
  quoteId?: string;
  createdAt: string;
  firstResponseAt?: string;
  closedAt?: string;
}

export interface QuoteLine {
  label: string;
  optimistic: number;   // hours, PERT a
  mostLikely: number;   // hours, PERT m
  pessimistic: number;  // hours, PERT b
  expected: number;     // (a + 4m + b) / 6
}

export interface Quote {
  id: string;
  inquiryId: string;
  token: string;               // unguessable link for the client view
  lines: QuoteLine[];
  complexity: Complexity;
  expectedHours: number;
  standardDeviation: number;
  quotedHours: number;          // expected + confidence buffer
  hourlyRate: number;
  totalNet: number;
  vatRate: number;
  totalGross: number;
  depositRate: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  createdAt: string;
  sentAt?: string;
  decidedAt?: string;
}

export interface Contract {
  id: string;
  quoteId: string;
  body: string;
  signedName?: string;
  signedAt?: string;
  /** SHA-256 over body, signer and timestamp: tamper evidence for the PoC signature. */
  signatureHash?: string;
}

export interface Invoice {
  id: string;
  contractId: string;
  amountNet: number;
  vat: number;
  amountGross: number;
  dueDate: string;
  externalId?: string;
  status: "created" | "pushed" | "paid";
  createdAt: string;
}

export interface OutboxMessage {
  id: string;
  inquiryId: string;
  to: string;
  subject: string;
  body: string;
  kind: "acknowledgement" | "booking_link" | "call_confirmation" | "quote" | "reminder" | "decline" | "contract" | "invoice" | "lost";
  createdAt: string;
}

export interface ScheduledTask {
  id: string;
  inquiryId: string;
  kind: "reminder_1" | "reminder_2" | "expire_quote";
  dueAt: string;
  status: "pending" | "done" | "cancelled";
}

/** Audit trail: every step records who acted, which supports traceability and KPI measurement. */
export interface AuditEvent {
  id: string;
  inquiryId: string;
  at: string;
  actor: "client" | "system" | "developer";
  type: string;
  detail: string;
}

export interface Database {
  clients: Client[];
  inquiries: Inquiry[];
  quotes: Quote[];
  contracts: Contract[];
  invoices: Invoice[];
  outbox: OutboxMessage[];
  tasks: ScheduledTask[];
  events: AuditEvent[];
  rejectedSubmissions: number;   // invalid form submissions blocked by validation (data quality KPI)
  clockOffsetMs: number;         // simulated time for demonstrations
}
