"use server";
/**
 * Server actions: thin adapters between the web forms and the workflow engine.
 * All business rules live in src/lib; these functions only parse form data,
 * call the engine and redirect.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { advanceClock } from "@/lib/clock";
import { resetDb } from "@/lib/store";
import type { Complexity } from "@/lib/types";
import {
  approveQuote, bookCall, clientDecision, generateQuote, reviewInquiry, runDueTasks, signContract, submitInquiry, WorkflowError,
} from "@/lib/workflow";

export type IntakeState = { errors?: Record<string, string>; values?: Record<string, unknown> };

export async function submitIntakeAction(_prev: IntakeState, form: FormData): Promise<IntakeState> {
  const values = {
    name: form.get("name"), email: form.get("email"), company: form.get("company") ?? "",
    projectType: form.get("projectType"), features: form.getAll("features"),
    budgetBand: form.get("budgetBand"), deadlineWeeks: form.get("deadlineWeeks"),
    description: form.get("description"), consent: form.get("consent") === "on",
  };
  const result = await submitInquiry(values);
  if (!result.ok) return { errors: result.errors, values };
  redirect(`/intake/done/${result.inquiryId}`);
}

export async function bookAction(form: FormData) {
  const id = String(form.get("inquiryId"));
  bookCall(id, String(form.get("slot")));
  redirect(`/book/${id}?booked=1`);
}

export async function reviewAction(form: FormData) {
  const id = String(form.get("inquiryId"));
  reviewInquiry(id, form.get("decision") === "accept");
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
  revalidatePath(`/dashboard/${id}`);
}

export async function decisionAction(form: FormData) {
  const token = String(form.get("token"));
  clientDecision(token, form.get("decision") === "accept");
  redirect(`/quote/${token}`);
}

export async function signAction(form: FormData) {
  const token = String(form.get("token"));
  try {
    await signContract(token, String(form.get("signer") ?? ""));
  } catch (e) {
    if (e instanceof WorkflowError) redirect(`/quote/${token}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/quote/${token}`);
}

export async function runAutomationAction() {
  runDueTasks();
  revalidatePath("/dashboard");
}

export async function advanceClockAction(form: FormData) {
  advanceClock(Number(form.get("days") ?? 1));
  runDueTasks();   // the scheduler runs after every clock change, like a cron job would
  revalidatePath("/dashboard");
}

export async function resetAction() {
  resetDb();
  revalidatePath("/dashboard");
}
