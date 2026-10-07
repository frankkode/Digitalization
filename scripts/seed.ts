/**
 * Seeds realistic demo data so every pipeline column and KPI has content.
 * Run with: npm run seed   (resets data/db.json)
 * The clock starts 30 days in the past and moves forward while the scenario runs,
 * so cycle times and reminders reflect elapsed time.
 */
import { advanceClock } from "../src/lib/clock";
import { resetDb, updateDb } from "../src/lib/store";
import { approveQuote, availableSlots, bookCall, clientDecision, generateQuote, reviewInquiry, runDueTasks, signContract, submitInquiry } from "../src/lib/workflow";

const base = { consent: true, company: "" };
const people = [
  { name: "Anna Lind", email: "anna@skargardstay.fi", company: "Skärgård Stay", projectType: "web_app", features: ["auth", "booking", "payments"], budgetBand: "15k_40k", deadlineWeeks: 12, description: "We run a guesthouse in the archipelago and need a booking web app where guests reserve rooms, pay online and get confirmations. Staff must log in and manage bookings and seasonal prices." },
  { name: "Mikko Salo", email: "mikko@nagufish.fi", company: "Nagu Fish Oy", projectType: "website", features: ["cms", "multilingual"], budgetBand: "5k_15k", deadlineWeeks: 6, description: "A new bilingual website in Finnish and Swedish for our fish shop with opening hours, product news we can edit ourselves and a simple contact form for restaurant orders." },
  { name: "Sara Holm", email: "sara@holmbygg.fi", company: "Holm Bygg Ab", projectType: "integration", features: ["erp", "dashboard"], budgetBand: "15k_40k", deadlineWeeks: 10, description: "Connect our project tool with the accounting software so hours and invoices sync automatically, and add a dashboard for project margins per month for the owners." },
  { name: "Lukas Berg", email: "lukas@example.com", company: "", projectType: "mobile_app", features: ["ai", "payments", "erp"], budgetBand: "under_2k", deadlineWeeks: 2, description: "Need an app quickly, like Uber but for boats, cheap." },
  { name: "Emma Nyström", email: "emma@arkipelagkafe.fi", company: "Arkipelag Kafé", projectType: "website", features: ["cms"], budgetBand: "2k_5k", deadlineWeeks: 5, description: "Simple website for our summer cafe with menu, photos and events that we can update ourselves during the season." },
  { name: "Jonas Lindqvist", email: "jonas@saltsea.fi", company: "Salt Sea Tours", projectType: "web_app", features: ["booking", "payments", "multilingual"], budgetBand: "5k_15k", deadlineWeeks: 8, description: "Tour booking platform for kayak trips with online payment, guide calendar and English, Finnish and Swedish versions for tourists in summer." },
  { name: "Peter Wik", email: "peter@wikmarin.fi", company: "Wik Marin", projectType: "mobile_app", features: ["auth"], budgetBand: "5k_15k", deadlineWeeks: 4, description: "An app for our boat service customers, maybe with login." },
  { name: "Helena Ek", email: "helena@ekkonsult.fi", company: "Ek Konsult", projectType: "consulting", features: [], budgetBand: "2k_5k", deadlineWeeks: 4, description: "We need advice on moving our office files and email to a secure cloud setup and on data protection basics for a team of five people." },
];

/** Moves the clock in 6 hour steps and runs the scheduler each time, like the production cron job. */
function tick(days: number) {
  for (let d = 0; d < days; d += 0.25) { advanceClock(Math.min(0.25, days - d)); runDueTasks(); }
}

async function main() {
  resetDb();
  updateDb((db) => { db.clockOffsetMs = -30 * 86_400_000; });
  const ids: string[] = [];
  for (const p of people) {
    const r = await submitInquiry({ ...base, ...p });
    if (r.ok) ids.push(r.inquiryId);
    tick(0.5);
  }
  // one invalid submission to show the data quality guard
  await submitInquiry({ ...base, name: "X", email: "wrong", projectType: "website", features: [], budgetBand: "2k_5k", deadlineWeeks: 3, description: "short", consent: false });

  const [anna, mikko, sara, lukas, emma, jonas] = ids;
  reviewInquiry(lukas, false);                        // human confirms the decline suggestion

  // Anna: full path to onboarding
  bookCall(anna, availableSlots()[0]); tick(2);
  const qa = generateQuote(anna, "medium"); approveQuote(anna); tick(2);
  clientDecision(qa.token, true); await signContract(qa.token, "Anna Lind");

  // Mikko: quote sent, never answers -> reminders, then expiry
  bookCall(mikko, availableSlots()[0]); tick(1);
  generateQuote(mikko, "low"); approveQuote(mikko);

  // Sara: accepted after one reminder
  bookCall(sara, availableSlots()[0]); tick(1);
  const qs = generateQuote(sara, "high"); approveQuote(sara);
  tick(3.2);
  clientDecision(qs.token, true); await signContract(qs.token, "Sara Holm");

  // Emma: rejected the quote
  bookCall(emma, availableSlots()[0]); tick(1);
  const qe = generateQuote(emma, "low"); approveQuote(emma); tick(1);
  clientDecision(qe.token, false);

  // Jonas: call booked, quote still a draft for the developer to approve
  bookCall(jonas, availableSlots()[0]); tick(1);
  generateQuote(jonas);

  tick(11);                    // Mikko's timers fire
  // Peter stays in review (grey zone), Helena stays qualified; bring the clock back to real time
  updateDb((db) => { db.clockOffsetMs = 0; });
  console.log("Seeded", ids.length, "inquiries");
}

main();
