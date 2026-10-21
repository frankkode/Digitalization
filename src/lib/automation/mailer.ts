/**
 * Email delivery adapter, version 1.0 addition.
 *
 * The workflow only writes messages to the outbox (a transactional outbox pattern), so a
 * process step never fails because a mail server is slow. A separate delivery run picks up
 * undelivered messages and hands them to a transport:
 *   - SMTP (nodemailer) when SMTP_HOST is configured in .env.local
 *   - otherwise the "log" transport, which keeps the message in the Outbox page (demo mode)
 * Failed deliveries are retried on the next run, up to MAX_ATTEMPTS.
 */
import { readDb, updateDb } from "../store";
import { nowIso } from "../clock";
import type { OutboxMessage } from "../types";

export const MAX_ATTEMPTS = 3;

export interface MailTransport {
  name: "smtp" | "log";
  send(message: OutboxMessage): Promise<void>;
}

/** Demo transport: nothing leaves the machine, the Outbox page is the evidence. */
export const logTransport: MailTransport = {
  name: "log",
  async send() { /* intentionally empty */ },
};

/** Real transport, created lazily so the dependency is only loaded when SMTP is configured. */
export async function smtpTransport(): Promise<MailTransport> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return {
    name: "smtp",
    async send(m) {
      await transporter.sendMail({
        from: process.env.MAIL_FROM ?? "Nordiso <no-reply@nordiso.example>",
        to: m.to,
        subject: m.subject,
        text: m.body,
        attachments: m.attachment ? [{ filename: m.attachment.filename, content: m.attachment.content, contentType: m.attachment.contentType }] : undefined,
      });
    },
  };
}

export async function defaultTransport(): Promise<MailTransport> {
  return process.env.SMTP_HOST ? smtpTransport() : logTransport;
}

/** Delivers every pending message once; returns counts for logging and tests. */
export async function deliverPending(transport?: MailTransport): Promise<{ delivered: number; failed: number }> {
  const t = transport ?? (await defaultTransport());
  const pending = readDb().outbox.filter((m) => !m.deliveredAt && (m.attempts ?? 0) < MAX_ATTEMPTS);
  let delivered = 0;
  let failed = 0;
  for (const message of pending) {
    try {
      await t.send(message);
      updateDb((db) => {
        const m = db.outbox.find((x) => x.id === message.id);
        if (m) { m.deliveredAt = nowIso(); m.transport = t.name; m.attempts = (m.attempts ?? 0) + 1; }
      });
      delivered++;
    } catch (err) {
      updateDb((db) => {
        const m = db.outbox.find((x) => x.id === message.id);
        if (m) { m.attempts = (m.attempts ?? 0) + 1; m.lastError = String(err).slice(0, 200); }
      });
      failed++;
    }
  }
  return { delivered, failed };
}
