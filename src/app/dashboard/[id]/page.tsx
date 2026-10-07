import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { FEATURES } from "@/lib/config";
import { approveQuoteAction, generateQuoteAction, reviewAction } from "../../actions";

const MAX = { serviceFit: 30, budgetFit: 30, scopeClarity: 20, deadlineFit: 20 } as const;
const LABEL = { serviceFit: "Service fit", budgetFit: "Budget fit", scopeClarity: "Scope clarity", deadlineFit: "Deadline fit" } as const;

/** Inquiry detail: everything the developer needs for the three remaining manual decisions. */
export default async function InquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = readDb();
  const inq = db.inquiries.find((i) => i.id === id);
  if (!inq) notFound();
  const client = db.clients.find((c) => c.id === inq.clientId)!;
  const quote = db.quotes.find((q) => q.id === inq.quoteId);
  const events = db.events.filter((e) => e.inquiryId === id);
  const tasks = db.tasks.filter((t) => t.inquiryId === id);
  const q = inq.qualification!;
  const ai = inq.aiSummary!;
  return (
    <>
      <p className="muted"><Link href="/dashboard">Dashboard</Link> / {inq.id}</p>
      <h1>{client.name}{client.company ? `, ${client.company}` : ""}</h1>
      <p className="sub">{client.email} · consent {client.consentAt.slice(0, 10)} · status <span className="pill info">{inq.status.replace("_", " ")}</span></p>

      <div className="grid g2">
        <div className="card">
          <h2>Qualification score: {q.score} / 100 <span className={`pill ${q.decision === "qualified" ? "ok" : q.decision === "needs_review" ? "warn" : "bad"}`}>{q.decision.replace("_", " ")}</span></h2>
          {(Object.keys(MAX) as Array<keyof typeof MAX>).map((key) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}><span>{LABEL[key]}</span><span className="muted">{q.breakdown[key]} / {MAX[key]}</span></div>
              <div className="bar"><i style={{ width: `${(q.breakdown[key] / MAX[key]) * 100}%` }} /></div>
            </div>
          ))}
          <p className="muted">{q.reasons.join(" · ")}</p>
          {inq.status === "needs_review" && (
            <form action={reviewAction} className="row">
              <input type="hidden" name="inquiryId" value={inq.id} />
              <button name="decision" value="accept">Accept and send booking link</button>
              <button name="decision" value="decline" className="danger">Decline politely</button>
            </form>
          )}
        </div>

        <div className="card">
          <h2>AI requirement summary <span className="pill info">{ai.source === "claude" ? "Claude API" : "local mock"}</span></h2>
          <p style={{ marginTop: 0 }}>{ai.summary}</p>
          <b style={{ fontSize: 13 }}>Key requirements</b>
          <ul style={{ marginTop: 4 }}>{ai.keyRequirements.map((r) => <li key={r}>{r}</li>)}</ul>
          <b style={{ fontSize: 13 }}>Risks</b>
          <ul style={{ marginTop: 4 }}>{ai.risks.length ? ai.risks.map((r) => <li key={r}>{r}</li>) : <li>None detected</li>}</ul>
          <p className="muted">Suggested complexity: <b>{ai.suggestedComplexity}</b>. Advisory only; the developer confirms after the call.</p>
          <p className="muted">Features: {inq.features.map((f) => FEATURES[f]?.label).join(", ") || "none"} · budget {inq.budgetBand} · {inq.deadlineWeeks} weeks</p>
        </div>
      </div>

      <div className="card">
        <h2>Quote</h2>
        {(inq.status === "call_booked" || inq.status === "quote_draft") && (
          <form action={generateQuoteAction} className="row" style={{ marginBottom: 12 }}>
            <input type="hidden" name="inquiryId" value={inq.id} />
            <span>Call held. Confirm complexity:</span>
            <select name="complexity" defaultValue={quote?.complexity ?? ai.suggestedComplexity} style={{ width: 140 }}>
              <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
            </select>
            <button className="secondary small">{quote ? "Recalculate draft" : "Generate draft quote"}</button>
          </form>
        )}
        {quote ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Work package</th><th className="num">Optimistic h</th><th className="num">Most likely h</th><th className="num">Pessimistic h</th><th className="num">PERT expected h</th></tr></thead>
                <tbody>
                  {quote.lines.map((l) => (
                    <tr key={l.label}><td>{l.label}</td><td className="num">{l.optimistic}</td><td className="num">{l.mostLikely}</td><td className="num">{l.pessimistic}</td><td className="num">{l.expected}</td></tr>
                  ))}
                  <tr><td><b>Total</b> (expected {quote.expectedHours} h + 1 SD {quote.standardDeviation} h)</td><td /><td /><td /><td className="num"><b>{quote.quotedHours} h</b></td></tr>
                </tbody>
              </table>
            </div>
            <p><b>EUR {quote.totalNet.toFixed(2)}</b> net · EUR {quote.totalGross.toFixed(2)} incl. VAT · status <span className="pill info">{quote.status}</span></p>
            {inq.status === "quote_draft" && (
              <form action={approveQuoteAction}><input type="hidden" name="inquiryId" value={inq.id} /><button>Approve and send to client</button></form>
            )}
            {quote.status !== "draft" && <p className="muted">Client link: <Link href={`/quote/${quote.token}`}>/quote/{quote.token.slice(0, 8)}...</Link></p>}
          </>
        ) : <p className="muted">Generated after the discovery call.</p>}
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Audit trail</h2>
          <div className="legend"><span><i style={{ background: "var(--brand)" }} />client</span><span><i style={{ background: "var(--ok)" }} />system</span><span><i style={{ background: "var(--warn)" }} />developer</span></div>
          <ul className="timeline">
            {events.map((e) => <li key={e.id} className={e.actor}><b>{e.type.replaceAll("_", " ")}</b> · {e.detail}<div className="muted">{e.at.slice(0, 16).replace("T", " ")}</div></li>)}
          </ul>
        </div>
        <div className="card">
          <h2>Scheduled timers</h2>
          {tasks.length ? (
            <div className="table-wrap">
              <table><thead><tr><th>Timer</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>{tasks.map((t) => <tr key={t.id}><td>{t.kind.replace("_", " ")}</td><td>{t.dueAt.slice(0, 16).replace("T", " ")}</td><td>{t.status}</td></tr>)}</tbody></table>
            </div>
          ) : <p className="muted">Timers start when the quote is sent.</p>}
        </div>
      </div>
    </>
  );
}
