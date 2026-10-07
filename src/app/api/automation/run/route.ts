/**
 * Scheduler endpoint for a cron trigger (e.g. every 15 minutes on the hosting platform).
 * Protected by a shared secret in production; open in the local prototype.
 */
import { NextResponse } from "next/server";
import { runDueTasks } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(runDueTasks());
}
