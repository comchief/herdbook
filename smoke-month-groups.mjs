import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext()).newPage();

let pass = 0, fail = 0;
function log(step, ok, extra = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${step} ${extra}`);
  if (ok) pass++; else fail++;
}
const dbUrl = fs.readFileSync(".env", "utf8").match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = (q) => execSync(`psql "${dbUrl}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

// Owner + farm
await page.goto(base + "/signup");
await page.fill('input[name="farmName"]', "Month Group Farm");
await page.fill('input[name="ownerName"]', "Month Owner");
await page.fill('input[name="email"]', "monthgroup-owner@example.com");
await page.fill('input[name="password"]', "testpass123");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/app");
const farmId = sql("select id from farms where name='Month Group Farm'");

// Seed: this month, last month (2 rows), two months ago (1 row), 14 months ago (1 row)
const mk = (monthsAgo, day) => `date_trunc('month', now() at time zone 'utc') - interval '${monthsAgo} months' + interval '${day - 1} days'`;
const exp = (monthsAgo, day, desc, amount) =>
  sql(`insert into expenses (id, farm_id, date, category, description, amount) values (gen_random_uuid()::text, '${farmId}', ${mk(monthsAgo, day)}, 'supplies', '${desc}', ${amount})`);
exp(0, 1, "Current Fence Wire", 100);
exp(1, 3, "LastMonth Hinges", 40);
exp(1, 20, "LastMonth Paint", 60);
exp(2, 5, "TwoAgo Buckets", 25);
exp(14, 9, "OldYear Trough", 300);

sql(`insert into feed_inventory (id, farm_id, feed_type, stock_kg, reorder_level_kg, cost_per_kg) values (gen_random_uuid()::text, '${farmId}', 'Grower', 100, 10, 1)`);
const fl = (monthsAgo, day, dir, qty, cost) =>
  sql(`insert into feed_logs (id, farm_id, feed_type, direction, quantity_kg, cost_total, date, source) values (gen_random_uuid()::text, '${farmId}', 'Grower', '${dir}', ${qty}, ${cost}, ${mk(monthsAgo, day)}, 'manual')`);
fl(0, 2, "purchase", 50, 75);
fl(1, 4, "purchase", 200, 250);
fl(1, 10, "usage", 30, 0);
fl(3, 6, "usage", 12, 0);

const monthName = (monthsAgo) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
};

// ---- Expenses ----
await page.goto(base + "/app/expenses");
let body = await page.innerText("body");
log("expenses: current month expense listed individually", body.includes("Current Fence Wire"));
log("expenses: older months NOT listed individually", !body.includes("LastMonth Hinges") && !body.includes("TwoAgo Buckets") && !body.includes("OldYear Trough"));
log("expenses: collapsed summary row per earlier month", [1, 2, 14].every((m) => body.includes(monthName(m))));
log("expenses: last month's summary shows count and $100 total", new RegExp(`${monthName(1)}[\\s\\S]{0,40}2 expenses[\\s\\S]{0,40}\\$100`, "i").test(body));

const toggle = (label) => page.locator(`button[aria-label$="${label}"]`);
await toggle(monthName(1)).click();
body = await page.innerText("body");
log("expenses: expanding last month reveals its two expenses", body.includes("LastMonth Hinges") && body.includes("LastMonth Paint"));
log("expenses: other months stay collapsed", !body.includes("TwoAgo Buckets"));
log("expenses: expanded rows keep their Delete buttons", (await page.locator('tr:has-text("LastMonth Paint") button:has-text("Delete")').count()) === 1);
await toggle(monthName(1)).click();
body = await page.innerText("body");
log("expenses: clicking again collapses it", !body.includes("LastMonth Hinges"));
// clicking the summary row (not just the arrow) also toggles
await page.click(`tr[data-month-group="${monthName(2)}"] td`);
body = await page.innerText("body");
log("expenses: clicking anywhere on the summary row expands it", body.includes("TwoAgo Buckets"));
log("expenses: aria-expanded reflects state", (await toggle(monthName(2)).getAttribute("aria-expanded")) === "true");

// delete an expense from inside an expanded group still works
await Promise.all([page.waitForNavigation(), page.click('tr:has-text("TwoAgo Buckets") button:has-text("Delete")')]);
await page.waitForLoadState("networkidle");
body = await page.innerText("body");
log("expenses: deleting from an expanded month works and its group disappears", !body.includes(monthName(2)) || !body.includes("TwoAgo"));

// ---- Feed movements ----
await page.goto(base + "/app/feed");
body = await page.innerText("body");
log("feed: current month movement shown individually", /Grower[\s\S]{0,40}purchase[\s\S]{0,20}50 kg/i.test(body));
log("feed: older movements not listed individually (only 1 data row + summary rows)", (await page.locator('span.badge:text-is("usage")').count()) === 0 && (await page.locator('span.badge:text-is("purchase")').count()) === 1);
log("feed: summary row for last month with bought/used totals", new RegExp(`${monthName(1)}[\\s\\S]{0,60}2 movements[\\s\\S]{0,30}bought 200 kg[\\s\\S]{0,20}used 30 kg`, "i").test(body));
log("feed: summary row for 3 months ago", body.includes(monthName(3)));
await toggle(monthName(1)).click();
await page.waitForTimeout(500); await page.screenshot({ path: "/tmp/month-groups-feed.png", clip: { x: 270, y: 560, width: 980, height: 370 } });
body = await page.innerText("body");
log("feed: expanding last month reveals its rows", /200 kg/.test(body) && /30 kg/.test(body));
log("feed: Delete button present inside expanded month", (await page.locator('tbody tr:has-text("200 kg") button:has-text("Delete")').count()) >= 1);

await browser.close();

// Cleanup
for (const tbl of ["activity_log", "expenses", "feed_logs", "feed_inventory", "pigs", "users"]) {
  try { sql(`delete from ${tbl} where farm_id='${farmId}'`); } catch (e) {}
}
try { sql(`delete from farms where id='${farmId}'`); } catch (e) { console.log("farm cleanup failed"); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
