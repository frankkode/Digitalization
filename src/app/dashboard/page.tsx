import Link from "next/link";
import { readDb } from "@/lib/store";
import { computeKpis } from "@/lib/kpi";
import type { InquiryStatus } from "@/lib/types";
import { advanceClockAction, resetAction, runAutomationAction } from "../actions";

/** Pipeline columns replace the Excel log and give the missing overview (P2, P5). */
const COLUMNS: Array<{ title: string; states: InquiryStatus[] }> = [
  { title: "Needs review", states: ["needs_review"] },
  { title: "Qualified", states: ["received", "qualified"] },
  { title: "Call booked", states: ["call_booked", "quote_draft"] },
  { title: "Quote sent", states: ["quote_sent"] },
  { title: "Won", states: ["accepted", "signed", "onboarded"] },
  { title: "Closed", states: ["declined", "lost"] },
];

const fmt = (n: number | null, suffix = "") => (n === null ? "n/a" : `${n}${suffix}`);
const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)} %`);

export default function Dashboard() {
  const db = readDb();
  const k = computeKpis(db);
  const clientName = (id: string) => db.clients.find((c) => c.id === id)?.name ?? "";
  return (
    <>
      <h1>Developer dashboard</h1>
      <p className="sub">Live pipeline and KPIs measured from the audit trail. Manual work is limited to review, the call and quote approval.</p>

      <div className="kpis">
        <div className="kpi"><div className="v">{fmt(k.firstResponseHoursAvg, " h")}</div><div className="l">First response time</div><div className="t">KPI P1</div></div>
        <div className="kpi"><div className="v">{fmt(k.cycleTimeDaysAvg, " d")}</div><div className="l">Inquiry to contract</div><div className="t">Cycle time</div></div>
        <div className="kpi"><div className="v">{pct(k.conversionRate)}</div><div className="l">Quote conversion</div><div className="t">Accepted / decided</div></div>
        <div className="kpi"><div className="v">{pct(k.dataErrorRate)}</div><div className="l">Data error rate</div><div className="t">{k.blockedInvalidSubmissions} invalid forms blocked</div></div>
        <div className="kpi"><div className="v">{fmt(k.manualTouchesPerInquiry)}</div><div className="l">Manual touches / inquiry</div><div className="t">Admin time proxy</div></div>
        <div className="kpi"><div className="v">{pct(k.automatedShare)}</div><div className="l">Automated steps</div><div className="t">{k.remindersSent} reminders sent</div></div>
      </div>

      <div className="card row">
        <b>Automation controls</b>
        <form action={runAutomationAction}><button className="small">Run scheduler now</button></form>
        {[1, 3, 7].map((d) => (
          <form action={advanceClockAction} key={d}><input type="hidden" name="days" value={d} /><button className="small secondary">Advance clock +{d} d</button></form>
        ))}
        <form action={resetAction}><button className="small danger">Reset data</button></form>
        <span className="muted">In production the scheduler runs every 15 minutes (GET /api/automation/run).</span>
      </div>

      <div className="board">
        {COLUMNS.map((col) => {
          const items = db.inquiries.filter((i) => col.states.includes(i.status));
          return (
            <div className="col" key={col.title}>
              <h3>{col.title} ({items.length})</h3>
              {items.map((i) => (
                <Link className="item" href={`/dashboard/${i.id}`} key={i.id}>
                  <b>{clientName(i.clientId)}</b>
                  {i.projectType.replace("_", " ")} · score {i.qualification?.score ?? "n/a"}
                  <div><span className={`pill ${i.status === "lost" || i.status === "declined" ? "bad" : i.status === "onboarded" ? "ok" : "info"}`}>{i.status.replace("_", " ")}</span></div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
