import Link from "next/link";

/** Landing page: explains the To Be flow and links both user roles. */
export default function Home() {
  const steps = [
    ["1", "Single intake portal", "Structured form with validation and consent; instant acknowledgement.", "P1, P2"],
    ["2", "Qualification rules", "Weighted score routes the inquiry; declines stay a human decision.", "P1"],
    ["3", "Self service booking", "Client picks a discovery call slot from live availability.", "P3"],
    ["4", "Assisted quotation", "AI summary plus PERT estimate; developer approves before sending.", "P4"],
    ["5", "Automated follow up", "Timer rules send reminders and expire open quotes.", "P5"],
    ["6", "Contract to cash", "Template contract, e-signature and invoice pushed to accounting.", "P6, P7"],
  ];
  return (
    <>
      <h1>Automated client intake for Nordiso</h1>
      <p className="sub">Proof of concept for the To Be process (IU DLBCCOEDAH01, Phase 2). Try it as a client, then continue as the developer.</p>
      <div className="grid g3">
        {steps.map(([n, t, d, p]) => (
          <div className="card" key={n}>
            <span className="pill info">Step {n}</span> <span className="pill bad">{p}</span>
            <h2 style={{ marginTop: 10 }}>{t}</h2>
            <p className="muted" style={{ fontSize: 14 }}>{d}</p>
          </div>
        ))}
      </div>
      <div className="row">
        <Link className="btn" href="/intake">Open the client portal</Link>
        <Link className="btn secondary" href="/dashboard">Open the developer dashboard</Link>
      </div>
    </>
  );
}
