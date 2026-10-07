/**
 * Unit tests for the automation logic (rules, algorithm, validation).
 * Test IDs (T1..T8) are referenced in the Phase 2 report.
 */
import { describe, expect, it } from "vitest";
import { estimate, pertExpected, pertStdDev } from "@/lib/automation/pricing";
import { qualify } from "@/lib/automation/qualification";
import { validateIntake } from "@/lib/automation/validation";
import { mockSummarize } from "@/lib/automation/summarizer";
import { signatureHash } from "@/lib/automation/documents";

const goodInquiry = {
  projectType: "web_app" as const,
  features: ["auth", "booking", "payments"],
  budgetBand: "15k_40k" as const,
  deadlineWeeks: 12,
  description: "We run a small guesthouse in the archipelago and need a booking web app where guests can reserve rooms, pay online and receive confirmations automatically. Staff should log in and manage bookings.",
};

describe("T1 PERT estimation", () => {
  it("computes expected value and standard deviation with the PERT formulas", () => {
    expect(pertExpected(10, 20, 36)).toBeCloseTo(21, 5);   // (10 + 80 + 36) / 6
    expect(pertStdDev(10, 36)).toBeCloseTo(26 / 6, 5);
  });

  it("adds one standard deviation as buffer and prices the hours", () => {
    const e = estimate("website", ["cms"], "medium");
    expect(e.quotedHours).toBeGreaterThan(e.expectedHours);
    expect(e.totalNet).toBe(e.quotedHours * 75);
    expect(e.vat).toBeCloseTo(e.totalNet * 0.255, 1);
  });

  it("scales with complexity", () => {
    const low = estimate("web_app", ["auth"], "low").totalNet;
    const high = estimate("web_app", ["auth"], "high").totalNet;
    expect(high).toBeGreaterThan(low);
  });
});

describe("T2 qualification rules", () => {
  it("qualifies a clear core service inquiry with an adequate budget", () => {
    const r = qualify(goodInquiry);
    expect(r.decision).toBe("qualified");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("routes a low budget, vague inquiry to a decline suggestion, never an automatic decline", () => {
    const r = qualify({ projectType: "mobile_app", features: ["payments", "ai", "erp"], budgetBand: "under_2k", deadlineWeeks: 2, description: "Need an app fast, cheap please." });
    expect(r.decision).toBe("decline_suggested");
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("keeps every criterion within its maximum", () => {
    const { breakdown: b } = qualify(goodInquiry);
    expect(b.serviceFit).toBeLessThanOrEqual(30);
    expect(b.budgetFit).toBeLessThanOrEqual(30);
    expect(b.scopeClarity).toBeLessThanOrEqual(20);
    expect(b.deadlineFit).toBeLessThanOrEqual(20);
  });
});

describe("T3 intake validation (data quality)", () => {
  it("rejects missing consent and invalid email", () => {
    const r = validateIntake({ ...goodInquiry, name: "Anna", email: "not-an-email", consent: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toBeDefined();
      expect(r.errors.consent).toBeDefined();
    }
  });

  it("accepts a complete submission and normalises the email", () => {
    const r = validateIntake({ ...goodInquiry, name: "Anna Lind", email: " Anna@Example.FI ", consent: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe("anna@example.fi");
  });
});

describe("T4 AI summary fallback", () => {
  it("returns the same contract as the model output and flags integration risks", () => {
    const s = mockSummarize({ ...goodInquiry, features: ["erp"], description: "Integrate our webshop with the accounting API so invoices sync." });
    expect(s.source).toBe("mock");
    expect(s.risks.join(" ")).toMatch(/integration/i);
    expect(["low", "medium", "high"]).toContain(s.suggestedComplexity);
  });
});

describe("T5 signature integrity", () => {
  it("changes the hash when the contract text is altered", () => {
    const a = signatureHash("Price EUR 1000", "Anna Lind", "2026-10-01T10:00:00Z");
    const b = signatureHash("Price EUR 100", "Anna Lind", "2026-10-01T10:00:00Z");
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});
