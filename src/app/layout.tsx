import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { now } from "@/lib/clock";

export const metadata = { title: "Nordiso Intake Automation (PoC)" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const t = now();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="logo">Nordiso<span>Intake automation prototype</span></Link>
            <nav>
              <Link href="/intake">Client portal</Link>
              <Link href="/dashboard">Developer dashboard</Link>
              <Link href="/outbox">Outbox</Link>
            </nav>
            {/* simulated clock used to demonstrate timer rules */}
            <div className="clock">System time: {t.toISOString().slice(0, 16).replace("T", " ")} UTC</div>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
