import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";

export default async function Done({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inq = readDb().inquiries.find((i) => i.id === id);
  if (!inq) notFound();
  return (
    <div className="card">
      <div className="notice">Thank you. Your inquiry <b>{inq.id}</b> is registered and a confirmation email was sent.</div>
      {inq.status === "qualified" ? (
        <>
          <h2>Next step: choose a time for a 30 minute discovery call</h2>
          <Link className="btn" href={`/book/${inq.id}`}>Choose a time</Link>
        </>
      ) : (
        <p>We will review your request personally and get back to you within one working day.</p>
      )}
    </div>
  );
}
