import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { decisionAction, signAction } from "../../actions";

/** Client view: review, accept, sign (P6); the invoice follows automatically (P7). */
export default async function QuoteView({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const db = readDb();
  const quote = db.quotes.find((q) => q.token === token);
  if (!quote || quote.status === "draft") notFound();
  const inq = db.inquiries.find((i) => i.id === quote.inquiryId)!;
  const contract = db.contracts.find((c) => c.quoteId === quote.id);
  const invoice = contract && db.invoices.find((i) => i.contractId === contract.id);
  return (
    <>
      <h1>Your quote {quote.id}</h1>
      <p className="sub">Valid for 14 days from sending. Prices in EUR.</p>
      <div className="card">
        <table>
          <thead><tr><th>Work package</th><th className="num">Hours (expected)</th></tr></thead>
          <tbody>{quote.lines.map((l) => <tr key={l.label}><td>{l.label}</td><td className="num">{l.expected}</td></tr>)}</tbody>
        </table>
        <p>Quoted effort <b>{quote.quotedHours} h</b> including a risk buffer · <b>EUR {quote.totalNet.toFixed(2)}</b> net · EUR {quote.totalGross.toFixed(2)} incl. VAT {(quote.vatRate * 100).toFixed(1)} %</p>
        {quote.status === "sent" && (
          <form action={decisionAction} className="row">
            <input type="hidden" name="token" value={token} />
            <button name="decision" value="accept">Accept quote</button>
            <button name="decision" value="reject" className="secondary">Decline</button>
          </form>
        )}
        {quote.status === "rejected" && <p>You declined this quote. Thank you for considering Nordiso.</p>}
        {quote.status === "expired" && <p>This quote has expired.</p>}
      </div>

      {contract && (
        <div className="card">
          <h2>Service agreement</h2>
          <pre className="contract">{contract.body}</pre>
          {inq.status === "accepted" ? (
            <form action={signAction} className="row">
              <input type="hidden" name="token" value={token} />
              <input type="text" name="signer" placeholder="Type your full name to sign" style={{ maxWidth: 320 }} />
              <button>Sign electronically</button>
              {error && <span className="err">{error}</span>}
            </form>
          ) : contract.signedAt && (
            <div className="notice">Signed by <b>{contract.signedName}</b> on {contract.signedAt.slice(0, 16).replace("T", " ")} UTC · SHA-256 {contract.signatureHash?.slice(0, 24)}...</div>
          )}
          {invoice && <p>Deposit invoice <b>{invoice.externalId}</b>: EUR {invoice.amountGross.toFixed(2)} due {invoice.dueDate}. Your project workspace is being prepared.</p>}
        </div>
      )}
    </>
  );
}
