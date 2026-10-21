"use server";
/**
 * Server actions: thin adapters between the web forms and the workflow engine.
 * All business rules live in src/lib; these functions only parse form data,
 * call the engine and redirect.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createSession, passwordMatches, SESSION_COOKIE, SESSION_HOURS } from "@/lib/auth";
import { deliverPending } from "@/lib/automation/mailer";
import { allowRequest } from "@/lib/ratelimit";
import { advanceClock } from "@/lib/clock";
import { resetDb } from "@/lib/store";
import type { Complexity } from "@/lib/types";
import {
  approveQuote, bookCall, clientDecision, generateQuote, reviewInquiry, runDueTasks, signContract, submitInquiry, WorkflowError,
} from "@/lib/workflow";

export type IntakeState = { errors?: Record<string, string>; values?: Record<string, unknown> };

/** Hands new outbox messages to the mail transport; a delivery problem never blocks the process step. */
async function deliver(): Promise<void> {
  try { await deliverPending(); } catch { /* retried on the next run */ }
}

export async function submitIntakeAction(_prev: IntakeState, form: FormData): Promise<IntakeState> {
  const values = {
    name: form.get("name"), email: form.get("email"), company: form.get("company") ?? "",
    projectType: form.get("projectType"), features: form.getAll("features"),
    budgetBand: form.get("budgetBand"), deadlineWeeks: form.get("deadlineWeeks"),
    description: form.get("description"), consent: form.get("consent") === "on",
  };
  // spam protection: limit submissions per client address
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(ip)) return { errors: { form: "Too many submissions. Please try again in a few minutes." }, values };
  const result = await submitInquiry(values);
  if (!result.ok) return { errors: result.errors, values };
  await deliver();
  redirect(`/intake/done/${result.inquiryId}`);
}

export async function bookAction(form: FormData) {
  const id = String(form.get("inquiryId"));
  bookCall(id, String(form.get("slot")));
  await deliver();
  redirect(`/book/${id}?booked=1`);
}

export async function reviewAction(form: FormData) {
  const id = String(form.get("inquiryId"));
  reviewInquiry(id, form.get("decision") === "accept");
  await deliver();
  revalidatePath(`/dashboard/${id}`);
}

export async function generateQuoteAction(form: FormData) {
  const id = String(form.get("inquiryId"));
  generateQuote(id, String(form.get("complexity")) as Complexity);
  revalidatePath(`/dashboard/${id}`);
}

export async function approveQuoteAction(form: FormData) {
  const id = String(form.get("inquiryId"));
  approveQuote(id);
  await deliver();
  revalidatePath(`/dashboard/${id}`);
}

export async function decisionAction(form: FormData) {
  const token = String(form.get("token"));
  clientDecision(token, form.get("decision") === "accept");
  await deliver();
  redirect(`/quote/${token}`);
}

export async function signAction(form: FormData) {
  const token = String(form.get("token"));
  try {
    await signContract(token, String(form.get("signer") ?? ""));
    await deliver();
  } catch (e) {
    if (e instanceof WorkflowError) redirect(`/quote/${token}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/quote/${token}`);
}

export async function runAutomationAction() {
  runDueTasks();
  revalidatePath("/dashboard");
  await deliver();
}

export async function advanceClockAction(form: FormData) {
  advanceClock(Number(form.get("days") ?? 1));
  runDueTasks();   // the scheduler runs after every clock change, like a cron job would
  await deliver();
  revalidatePath("/dashboard");
}

export async function resetAction() {
  resetDb();
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------- dashboard login (version 1.0)
export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`login:${ip}`)) return { error: "Too many attempts. Please wait a few minutes." };
  if (!passwordMatches(String(form.get("password") ?? ""))) return { error: "Wrong password." };
  (await cookies()).set(SESSION_COOKIE, await createSession(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600,
  });
  const next = String(form.get("next") ?? "/dashboard");
  redirect(next.startsWith("/") ? next : "/dashboard");   // only local redirects (no open redirect)
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
