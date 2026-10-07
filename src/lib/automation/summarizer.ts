/**
 * AI supported requirement summary (addresses P4, unstructured notes).
 *
 * The large language model only *structures* the client's own text into a summary,
 * key requirements, risks and a complexity suggestion. It never sets prices or
 * sends messages: the output is advisory and shown to the developer for approval.
 * Without an API key, or on any error, a deterministic local summarizer is used so
 * the prototype stays reproducible and testable.
 */
import { z } from "zod";
import { FEATURES } from "../config";
import type { AiSummary, Complexity } from "../types";
import type { QualificationInput } from "./qualification";

/** Prompt sent to the model. JSON only output makes the response machine checkable. */
export const SUMMARY_PROMPT = `You are an assistant for a small software company.
Read the client inquiry below and respond with JSON only, using exactly these keys:
{"summary": string (max 60 words, neutral tone),
 "keyRequirements": string[] (3 to 6 short items),
 "risks": string[] (0 to 4 short items, e.g. unclear scope, integrations, tight deadline),
 "suggestedComplexity": "low" | "medium" | "high"}
Do not invent requirements that the client did not mention. Do not estimate prices.`;

const summarySchema = z.object({
  summary: z.string().max(600),
  keyRequirements: z.array(z.string()).max(8),
  risks: z.array(z.string()).max(6),
  suggestedComplexity: z.enum(["low", "medium", "high"]),
});

function inquiryText(input: QualificationInput): string {
  const features = input.features.map((f) => FEATURES[f]?.label ?? f).join(", ") || "none selected";
  return `Project type: ${input.projectType}\nSelected features: ${features}\nBudget band: ${input.budgetBand}\nDeadline: ${input.deadlineWeeks} weeks\nDescription: ${input.description}`;
}

/** Deterministic fallback: keyword rules instead of a model, same output contract. */
export function mockSummarize(input: QualificationInput): AiSummary {
  const text = input.description.toLowerCase();
  const risks: string[] = [];
  if (/integrat|api|erp|accounting|legacy/.test(text) || input.features.includes("erp")) risks.push("External integration may need access and documentation");
  if (input.deadlineWeeks <= 4) risks.push("Tight deadline");
  if (input.description.split(/\s+/).length < 25) risks.push("Scope described briefly; confirm details in the call");
  if (/ai|chatbot|gpt|assistant/.test(text) || input.features.includes("ai")) risks.push("AI feature needs data protection review");

  const heavy = input.features.filter((f) => ["payments", "erp", "ai", "auth", "booking"].includes(f)).length;
  const complexity: Complexity = heavy >= 3 || risks.length >= 3 ? "high" : heavy >= 1 || input.features.length >= 3 ? "medium" : "low";

  const firstSentence = input.description.split(/(?<=[.!?])\s/)[0].slice(0, 220);
  return {
    summary: `${input.projectType.replace("_", " ")} project: ${firstSentence}`,
    keyRequirements: input.features.length ? input.features.map((f) => FEATURES[f]?.label ?? f) : ["Requirements to be clarified"],
    risks,
    suggestedComplexity: complexity,
    source: "mock",
  };
}

/** Calls the Anthropic Messages API; validated with zod, falls back to the mock on failure. */
export async function summarize(input: QualificationInput): Promise<AiSummary> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return mockSummarize(input);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
        max_tokens: 600,
        temperature: 0,
        system: SUMMARY_PROMPT,
        messages: [{ role: "user", content: inquiryText(input) }],
      }),
    });
    if (!res.ok) throw new Error(`API status ${res.status}`);
    const payload = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = payload.content.find((c) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { ...summarySchema.parse(json), source: "claude" };
  } catch {
    return mockSummarize(input);
  }
}
