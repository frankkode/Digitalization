/**
 * Captures supporting evidence screenshots of the running prototype (npm run start first).
 * Also exercises the client journey through the real UI: validation, submission, booking.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const OUT = process.argv[2] || "evidence";
const BASE = "http://localhost:3000";
const db = () => JSON.parse(fs.readFileSync("data/db.json", "utf8"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 560 }, deviceScaleFactor: 1.5 });
  const shot = async (name, full = true) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("saved", name); };

  await page.goto(BASE); await shot("01_home");

  // client journey through the intake form
  await page.goto(`${BASE}/intake`);
  await page.fill("#name", "Oskar Grön");
  await page.fill("#email", "oskar@grontradgard");
  await page.fill("#description", "Webshop");
  await page.click("button[type=submit]");
  await page.waitForSelector(".err");
  await shot("02_intake_validation");

  await page.fill("#email", "oskar@grontradgard.fi");
  await page.fill("#company", "Grön Trädgård");
  await page.selectOption("#projectType", "website");
  await page.selectOption("#budgetBand", "5k_15k");
  await page.fill("#deadlineWeeks", "8");
  for (const f of ["cms", "payments", "multilingual"]) await page.check(`input[value=${f}]`);
  await page.fill("#description", "Our garden shop in Nagu needs a bilingual website with a small webshop for seasonal plants, online payment and pickup times, plus news we can update ourselves.");
  await page.check("input[name=consent]");
  await shot("03_intake_filled");
  await page.click("button[type=submit]");
  await page.waitForURL(/intake\/done/);
  await shot("04_intake_confirmation");

  await page.goto(BASE + (await page.getAttribute("a.btn", "href")));
  await shot("05_self_service_booking");
  await page.locator(".slots button").first().click();
  await page.waitForSelector(".notice");
  await shot("06_booking_confirmed");

  await page.goto(`${BASE}/dashboard`); await shot("07_dashboard");

  const d = db();
  const byName = (n) => d.inquiries.find((i) => d.clients.find((c) => c.id === i.clientId).name === n);
  await page.goto(`${BASE}/dashboard/${byName("Peter Wik").id}`); await shot("08_review_grey_zone");
  await page.goto(`${BASE}/dashboard/${byName("Jonas Lindqvist").id}`); await shot("09_quote_draft_pert");
  await page.goto(`${BASE}/dashboard/${byName("Mikko Salo").id}`); await shot("10_follow_up_timers");
  await page.goto(`${BASE}/dashboard/${byName("Anna Lind").id}`); await shot("11_onboarded_audit_trail");

  const annaQuote = d.quotes.find((q) => q.inquiryId === byName("Anna Lind").id);
  await page.goto(`${BASE}/quote/${annaQuote.token}`); await shot("12_client_quote_contract_signed");
  await page.goto(`${BASE}/outbox`); await shot("13_outbox_automated_messages");
  await browser.close();
})();
