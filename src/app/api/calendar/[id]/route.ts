/**
 * Calendar invitation download for a booked discovery call (.ics, RFC 5545).
 * Linked from the booking confirmation page and attached to the confirmation email.
 */
import { readDb } from "@/lib/store";
import { callInvitation } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = readDb();
  const inq = db.inquiries.find((i) => i.id === id);
  if (!inq?.callSlot) return new Response("No booked call for this reference", { status: 404 });
  return new Response(callInvitation(db, inq), {
    headers: {
      "content-type": "text/calendar; charset=utf-8; method=REQUEST",
      "content-disposition": `attachment; filename="nordiso-discovery-call-${inq.id}.ics"`,
    },
  });
}
