/**
 * Input validation for the single intake form (addresses P1 and P2).
 * A structured schema replaces free text emails, so every record is complete
 * before it enters the client record; invalid submissions are counted for the
 * data error rate KPI.
 */
import { z } from "zod";
import { FEATURES } from "../config";

export const intakeSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name"),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address"),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  projectType: z.enum(["website", "web_app", "mobile_app", "integration", "consulting"]),
  features: z.array(z.string()).refine((list) => list.every((f) => f in FEATURES), "Unknown feature selected"),
  budgetBand: z.enum(["under_2k", "2k_5k", "5k_15k", "15k_40k", "over_40k"]),
  deadlineWeeks: z.coerce.number().int().min(1).max(104),
  description: z.string().trim().min(30, "Please describe the project in at least 30 characters").max(4000),
  // GDPR Art. 6(1)(b) and data minimisation: processing only after explicit confirmation
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to process your inquiry" }) }),
});

export type IntakeInput = z.infer<typeof intakeSchema>;

export type ValidationOutcome =
  | { ok: true; data: IntakeInput }
  | { ok: false; errors: Record<string, string> };

export function validateIntake(raw: unknown): ValidationOutcome {
  const parsed = intakeSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
