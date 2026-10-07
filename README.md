# Nordiso Intake Automation: Proof of Concept

Prototype for the IU course *Project: Digitalization and Automation Hackathon* (DLBCCOEDAH01), Phase 2.
It implements the To Be process for client intake, quotation and onboarding at Nordiso.

## Run it

Requirements: Node.js 20 or newer.

```bash
npm install
npm run seed        # demo data covering every pipeline state
npm run dev         # http://localhost:3000
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` to use the Claude API
for requirement summaries. Without a key a deterministic local summarizer is used.

| Command | Purpose |
|---|---|
| `npm test` | 18 unit and workflow tests (T1 to T8) |
| `npm run simulate` | seeded simulation of 60 inquiries, writes `results/simulation.json` |
| `npm run typecheck` | TypeScript strict type check |
| `npm run build` | production build |

## What to try

1. **Client portal** (`/intake`): submit an inquiry; invalid data is blocked, a confirmation is sent instantly.
2. **Booking** (`/book/:id`): pick a discovery call slot.
3. **Developer dashboard** (`/dashboard`): pipeline, KPIs, automation controls. Open an inquiry to see the
   qualification score, AI summary, PERT quote and audit trail. Approve the quote.
4. **Client quote** (`/quote/:token`): accept, then sign the generated contract; the deposit invoice is pushed
   to the (mock) accounting API.
5. Use **Advance clock** on the dashboard to watch reminders fire and open quotes expire.

## Structure

```
src/lib/config.ts                 business rules (rates, catalogue, thresholds, timers)
src/lib/types.ts                  domain model (central client record)
src/lib/store.ts                  JSON repository (swap for PostgreSQL/Supabase)
src/lib/workflow.ts               workflow engine: one function per BPMN event
src/lib/automation/validation.ts  intake schema (zod), GDPR consent
src/lib/automation/qualification.ts  weighted scoring rules
src/lib/automation/pricing.ts     PERT three point estimation
src/lib/automation/summarizer.ts  Claude API adapter with deterministic fallback
src/lib/automation/documents.ts   contract template, signature hash, accounting adapter
src/lib/kpi.ts                    KPIs computed from the audit trail
src/app/...                       Next.js pages and server actions
tests/                            Vitest test suites
scripts/                          seed, simulation, screenshots, charts
```

## Limitations (proof of concept)

Email, calendar, e-signature and accounting are simulated through adapters and an outbox log.
There is no authentication on the developer dashboard. Prices and effort values are illustrative settings.
