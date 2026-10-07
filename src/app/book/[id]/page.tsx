import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { availableSlots } from "@/lib/workflow";
import { bookAction } from "../../actions";

/** Self service booking replaces the email back and forth (P3). */
export default async function Book({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inq = readDb().inquiries.find((i) => i.id === id);
  if (!inq) notFound();
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });
  if (inq.callSlot) {
    return <div className="card"><div className="notice">Your discovery call is booked for <b>{fmt(inq.callSlot)}</b> (Helsinki time). A calendar invitation was sent.</div></div>;
  }
  if (inq.status !== "qualified") return <div className="card">Booking is not available for this request yet.</div>;
  return (
    <>
      <h1>Choose a discovery call time</h1>
      <p className="sub">All times are Helsinki time. Slots update live, so a booked time disappears for others.</p>
      <div className="card slots">
        {availableSlots().slice(0, 12).map((s) => (
          <form action={bookAction} key={s}>
            <input type="hidden" name="inquiryId" value={inq.id} />
            <input type="hidden" name="slot" value={s} />
            <button className="secondary" style={{ width: "100%" }}>{fmt(s)}</button>
          </form>
        ))}
      </div>
    </>
  );
}
