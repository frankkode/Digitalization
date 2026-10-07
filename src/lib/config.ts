/**
 * Business rules in one place so the developer can tune them without touching code paths.
 * Values are illustrative settings for the proof of concept, not audited prices.
 */
import type { BudgetBand, Complexity, ProjectType } from "./types";

export const BUSINESS = {
  hourlyRate: 75,          // EUR, net
  vatRate: 0.255,          // Finnish general VAT rate
  depositRate: 0.3,        // 30 % deposit invoiced on signature
  paymentTermDays: 14,
  hoursPerWeek: 20,        // delivery capacity next to other work
} as const;

/** Services Nordiso offers; anything else lowers the service fit score. */
export const OFFERED_SERVICES: ProjectType[] = ["website", "web_app", "integration", "consulting", "mobile_app"];
export const CORE_SERVICES: ProjectType[] = ["website", "web_app", "integration"];

/** Upper bound of each budget band in EUR (net). */
export const BUDGET_UPPER: Record<BudgetBand, number> = {
  under_2k: 2000,
  "2k_5k": 5000,
  "5k_15k": 15000,
  "15k_40k": 40000,
  over_40k: 80000,
};

/** Base effort per project type as a PERT triple (hours). */
export const BASE_EFFORT: Record<ProjectType, [number, number, number]> = {
  website: [12, 20, 36],
  web_app: [40, 70, 120],
  mobile_app: [60, 100, 170],
  integration: [16, 30, 60],
  consulting: [4, 8, 16],
};

/** Feature catalogue: PERT triples in hours; the intake form offers exactly these options. */
export const FEATURES: Record<string, { label: string; effort: [number, number, number] }> = {
  cms: { label: "Content management", effort: [6, 10, 18] },
  auth: { label: "User login and roles", effort: [8, 14, 26] },
  payments: { label: "Online payments", effort: [10, 18, 34] },
  booking: { label: "Booking or scheduling", effort: [10, 20, 36] },
  multilingual: { label: "Multilingual content", effort: [4, 8, 16] },
  erp: { label: "Accounting or ERP integration", effort: [12, 24, 48] },
  dashboard: { label: "Reporting dashboard", effort: [8, 16, 30] },
  ai: { label: "AI assistant feature", effort: [12, 24, 50] },
};

/** Complexity multiplies every estimate; derived from the AI summary and confirmed by the developer. */
export const COMPLEXITY_FACTOR: Record<Complexity, number> = { low: 0.9, medium: 1.0, high: 1.25 };

/** Qualification thresholds (score 0 to 100). */
export const QUALIFY_THRESHOLD = 60;
export const REVIEW_THRESHOLD = 40;

/** Follow up timers after a quote is sent (event condition action rules). */
export const FOLLOW_UP = {
  reminder1Days: 3,
  reminder2Days: 7,
  expireDays: 14,
} as const;

/** Discovery call availability for self service booking. */
export const AVAILABILITY = {
  weekdays: [1, 2, 3, 4],          // Monday to Thursday
  hoursLocal: [9, 13, 16],         // start hours, 30 minute slots
  daysAhead: 10,
} as const;
