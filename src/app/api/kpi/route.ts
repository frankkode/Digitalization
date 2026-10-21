/**
 * KPI export for the monthly continuous improvement review (protected by the dashboard login).
 * GET /api/kpi          JSON snapshot of all KPIs
 * GET /api/kpi?format=csv  one row per inquiry for spreadsheet analysis
 */
import { readDb } from "@/lib/store";
import { computeKpis, inquiriesCsv } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const db = readDb();
  if (new URL(request.url).searchParams.get("format") === "csv") {
    return new Response(inquiriesCsv(db), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="nordiso-kpi-export.csv"' },
    });
  }
  return Response.json({ generatedAt: new Date().toISOString(), ...computeKpis(db) });
}
