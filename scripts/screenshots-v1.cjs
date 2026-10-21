/**
 * Evidence screenshots for the version 1.0 features (run against `npm run start`
 * with DASHBOARD_PASSWORD=demo123). Usage: node scripts/screenshots-v1.cjs <out dir>
 */
const { chromium } = require("playwright");
const OUT = process.argv[2] || "evidence";
const BASE = process.env.BASE_URL || "http://localhost:3010";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 560 }, deviceScaleFactor: 1.5 });
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log("saved", name); };

  // 1 friendlier form: live hint for short descriptions
  await page.goto(`${BASE}/intake`);
  await page.fill("#name", "Oskar Grön");
  await page.fill("#email", "oskar@grontradgard.fi");
  await page.selectOption("#projectType", "website");
  await page.fill("#description", "Small webshop for plants");
  await shot("v1_01_intake_live_hint");

  // 2 submit, book and get the calendar invitation
  await page.fill("#company", "Grön Trädgård");
  await page.selectOption("#budgetBand", "5k_15k");
  await page.fill("#deadlineWeeks", "8");
  for (const f of ["cms", "payments", "multilingual"]) await page.check(`input[value=${f}]`);
  await page.fill("#description", "Our garden shop in Nagu needs a bilingual website with a small webshop for seasonal plants, online payment and pickup times.");
  await page.check("input[name=consent]");
  await page.click("button[type=submit]");
  await page.waitForURL(/intake\/done/);
  await page.goto(BASE + (await page.getAttribute("a.btn", "href")));
  await page.locator(".slots button").first().click();
  await page.waitForSelector("text=Add to calendar");
  await shot("v1_02_booking_calendar_invite");

  // 3 dashboard login
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(/login/);
  await shot("v1_03_login");
  await page.fill("#password", "wrong");
  await page.click("button[type=submit]");
  await page.waitForSelector(".err");
  await page.fill("#password", "demo123");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === "/dashboard");   // the login URL itself contains "dashboard" in ?next=
  await page.waitForSelector("text=Export KPIs");
  await shot("v1_04_dashboard_logged_in");

  // 4 outbox with delivery status
  await page.goto(`${BASE}/outbox`);
  await shot("v1_05_outbox_delivery");
  await browser.close();
})();
