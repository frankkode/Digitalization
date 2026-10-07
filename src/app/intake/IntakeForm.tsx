"use client";
/**
 * Client facing intake form. Validation messages come from the same zod schema the
 * server uses, so rules are defined once.
 */
import { useActionState } from "react";
import { submitIntakeAction, type IntakeState } from "../actions";
import { FEATURES } from "@/lib/config";

const PROJECT_TYPES: Record<string, string> = {
  website: "Website", web_app: "Web application", mobile_app: "Mobile app", integration: "System integration", consulting: "IT consulting",
};
const BUDGETS: Record<string, string> = {
  under_2k: "Under EUR 2 000", "2k_5k": "EUR 2 000 to 5 000", "5k_15k": "EUR 5 000 to 15 000", "15k_40k": "EUR 15 000 to 40 000", over_40k: "Over EUR 40 000",
};

export default function IntakeForm() {
  const [state, action, pending] = useActionState<IntakeState, FormData>(submitIntakeAction, {});
  const e = state.errors ?? {};
  const v = (state.values ?? {}) as Record<string, string | string[] | boolean>;
  return (
    <form action={action} className="card" noValidate>
      <div className="grid g2">
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={(v.name as string) ?? ""} />
          {e.name && <div className="err">{e.name}</div>}
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={(v.email as string) ?? ""} />
          {e.email && <div className="err">{e.email}</div>}
          <label htmlFor="company">Company (optional)</label>
          <input id="company" name="company" type="text" defaultValue={(v.company as string) ?? ""} />
          <label htmlFor="projectType">Project type</label>
          <select id="projectType" name="projectType" defaultValue={(v.projectType as string) ?? "web_app"}>
            {Object.entries(PROJECT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="grid g2">
            <div>
              <label htmlFor="budgetBand">Budget</label>
              <select id="budgetBand" name="budgetBand" defaultValue={(v.budgetBand as string) ?? "5k_15k"}>
                {Object.entries(BUDGETS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="deadlineWeeks">Desired delivery (weeks)</label>
              <input id="deadlineWeeks" name="deadlineWeeks" type="number" min={1} max={104} defaultValue={(v.deadlineWeeks as string) ?? "8"} />
              {e.deadlineWeeks && <div className="err">{e.deadlineWeeks}</div>}
            </div>
          </div>
        </div>
        <div>
          <label>Features needed</label>
          <div className="checks">
            {Object.entries(FEATURES).map(([k, f]) => (
              <label key={k}><input type="checkbox" name="features" value={k} defaultChecked={Array.isArray(v.features) && v.features.includes(k)} /> {f.label}</label>
            ))}
          </div>
          <label htmlFor="description">Describe your project</label>
          <textarea id="description" name="description" defaultValue={(v.description as string) ?? ""} placeholder="What should the solution do, for whom, and why now?" />
          {e.description && <div className="err">{e.description}</div>}
          <label className="consent" style={{ marginTop: 12 }}>
            <input type="checkbox" name="consent" /> I agree that Nordiso processes this information to answer my inquiry (GDPR). Data is deleted after 12 months if no agreement is made.
          </label>
          {e.consent && <div className="err">{e.consent}</div>}
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>{pending ? "Sending..." : "Send inquiry"}</button>
        <span className="muted">Typical reply: immediately</span>
      </div>
    </form>
  );
}
