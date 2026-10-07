/**
 * Contract generation, electronic signature and accounting hand over (addresses P6 and P7).
 *
 * - The contract is rendered from one maintained template, so clauses stay current.
 * - The signature is a simple electronic signature for the proof of concept: the typed
 *   name, a timestamp and a SHA-256 hash over the exact contract text (tamper evidence).
 *   Production would delegate to a qualified e-signature provider.
 * - The accounting adapter builds the invoice payload once from the client record and
 *   pushes it through an interface; the mock implementation stands in for the accounting
 *   software's REST API.
 */
import crypto from "node:crypto";
import { BUSINESS } from "../config";
import type { Client, Invoice, Quote } from "../types";
import { addDays } from "../clock";

export function renderContract(client: Client, quote: Quote, dateIso: string): string {
  const date = dateIso.slice(0, 10);
  const scope = quote.lines.map((l) => `  - ${l.label}`).join("\n");
  return [
    `SERVICE AGREEMENT ${quote.id.toUpperCase()}`,
    `Date: ${date}`,
    `Supplier: Nordiso, Finland`,
    `Client: ${client.name}${client.company ? `, ${client.company}` : ""} <${client.email}>`,
    ``,
    `1. Scope of work`,
    scope,
    `2. Price: EUR ${quote.totalNet.toFixed(2)} net (${quote.quotedHours} h at EUR ${quote.hourlyRate}/h), VAT ${(quote.vatRate * 100).toFixed(1)} % added.`,
    `3. Payment: ${Math.round(quote.depositRate * 100)} % deposit on signature, balance on delivery, ${BUSINESS.paymentTermDays} days net.`,
    `4. Changes: work outside the scope is quoted separately before it starts.`,
    `5. Data protection: personal data is processed only to deliver this agreement (GDPR Art. 6(1)(b)).`,
    `6. Law: Finnish law applies.`,
  ].join("\n");
}

export function signatureHash(body: string, signer: string, signedAt: string): string {
  return crypto.createHash("sha256").update(`${body}\n--\n${signer}\n${signedAt}`).digest("hex");
}

/** Payload shape close to common accounting REST APIs (customer, lines, VAT, due date). */
export interface InvoicePayload {
  customer: { name: string; email: string; company?: string };
  reference: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number; vatPercent: number }>;
  dueDate: string;
}

export interface AccountingAdapter {
  pushInvoice(payload: InvoicePayload): Promise<{ externalId: string }>;
}

/** Stand in for the accounting API; records what would be sent. */
export const mockAccounting: AccountingAdapter & { sent: InvoicePayload[] } = {
  sent: [],
  async pushInvoice(payload) {
    this.sent.push(payload);
    return { externalId: `ACC-${crypto.randomBytes(3).toString("hex").toUpperCase()}` };
  },
};

export function buildDepositInvoice(client: Client, quote: Quote, contractId: string, nowIso: string): { invoice: Omit<Invoice, "id">; payload: InvoicePayload } {
  const amountNet = Math.round(quote.totalNet * quote.depositRate * 100) / 100;
  const vat = Math.round(amountNet * quote.vatRate * 100) / 100;
  const dueDate = addDays(nowIso, BUSINESS.paymentTermDays).slice(0, 10);
  return {
    invoice: { contractId, amountNet, vat, amountGross: Math.round((amountNet + vat) * 100) / 100, dueDate, status: "created", createdAt: nowIso },
    payload: {
      customer: { name: client.name, email: client.email, company: client.company },
      reference: quote.id,
      lines: [{ description: `Deposit ${Math.round(quote.depositRate * 100)} % for agreement ${quote.id}`, quantity: 1, unitPrice: amountNet, vatPercent: quote.vatRate * 100 }],
      dueDate,
    },
  };
}
