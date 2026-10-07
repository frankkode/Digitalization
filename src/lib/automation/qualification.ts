/**
 * Rule based qualification (weighted scoring, addresses P1 and P4).
 *
 * Four transparent criteria add up to a score from 0 to 100. The thresholds route
 * the inquiry: qualified inquiries receive the booking link automatically, grey zone
 * inquiries wait for the developer, and low scores only produce a *suggestion* to
 * decline. Rejections always stay a human decision (human in the loop), because a
 * wrong automated decline would lose a client.
 */
import { BUDGET_UPPER, BUSINESS, CORE_SERVICES, OFFERED_SERVICES, QUALIFY_THRESHOLD, REVIEW_THRESHOLD } from "../config";
import type { BudgetBand, ProjectType, QualificationResult } from "../types";
import { estimate } from "./pricing";

export interface QualificationInput {
  projectType: ProjectType;
  features: string[];
  budgetBand: BudgetBand;
  deadlineWeeks: number;
  description: string;
}

export function qualify(input: QualificationInput): QualificationResult {
  const reasons: string[] = [];

  // 1. Service fit (max 30): core services score highest
  let serviceFit = 0;
  if (CORE_SERVICES.includes(input.projectType)) serviceFit = 30;
  else if (OFFERED_SERVICES.includes(input.projectType)) { serviceFit = 18; reasons.push("Service offered but outside the core focus"); }
  else reasons.push("Service not offered");

  // 2. Budget fit (max 30): compare the budget band with a medium complexity estimate
  const est = estimate(input.projectType, input.features, "medium");
  const budgetRatio = BUDGET_UPPER[input.budgetBand] / est.totalNet;
  let budgetFit: number;
  if (budgetRatio >= 1) budgetFit = 30;
  else if (budgetRatio >= 0.7) { budgetFit = 18; reasons.push("Budget slightly below the typical price"); }
  else if (budgetRatio >= 0.4) { budgetFit = 8; reasons.push("Budget clearly below the typical price"); }
  else { budgetFit = 0; reasons.push("Budget far below the typical price"); }

  // 3. Scope clarity (max 20): description length and explicit features
  const words = input.description.trim().split(/\s+/).length;
  let scopeClarity = Math.min(12, Math.floor(words / 5));   // up to 12 points for about 60 words
  scopeClarity += Math.min(8, input.features.length * 3);   // up to 8 points for selected features
  if (scopeClarity < 10) reasons.push("Scope is vague; clarify in the discovery call");

  // 4. Deadline fit (max 20): can the quoted hours be delivered with current capacity?
  const weeksNeeded = est.quotedHours / BUSINESS.hoursPerWeek;
  let deadlineFit: number;
  if (input.deadlineWeeks >= weeksNeeded) deadlineFit = 20;
  else if (input.deadlineWeeks >= weeksNeeded * 0.75) { deadlineFit = 10; reasons.push("Deadline is tight"); }
  else { deadlineFit = 0; reasons.push("Deadline is not realistic for the estimated effort"); }

  const score = serviceFit + budgetFit + scopeClarity + deadlineFit;
  const decision = score >= QUALIFY_THRESHOLD ? "qualified" : score >= REVIEW_THRESHOLD ? "needs_review" : "decline_suggested";
  if (reasons.length === 0) reasons.push("All criteria met");

  return { score, breakdown: { serviceFit, budgetFit, scopeClarity, deadlineFit }, decision, reasons };
}
