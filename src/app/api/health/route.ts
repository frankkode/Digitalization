/** Liveness check for hosting and uptime monitoring. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", version: process.env.npm_package_version ?? "1.0.0", time: new Date().toISOString() });
}
