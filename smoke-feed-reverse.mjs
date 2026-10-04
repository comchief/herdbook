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
async function clickAndWait(p, selector) {
  await Promise.all([p.waitForNavigation(), p.click(selector)]);
  await p.waitForLoadState("networkidle");
}
const dbUrl = fs.readFileSync(".env", "utf8").match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = (q) => execSync(`psql "${dbUrl}" -At -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

const stockOf = async () => {
  await page.goto(base + "/app/feed");
  const body = await page.innerText("body");
  const m = body.match(/Grower[\s\S]{0,40}?(\d+) kg · reorder/i);
  return m ? Number(m[1]) : null;
};
const rowText = async (pen) => (await page.innerText(`tr:has(td:text-is("${pen}"))`));

async function addPig(tag, pen) {
  await page.goto(base + "/app/pigs/new");
  await page.fill('input[name="tag"]', tag);
  await page.fill('input[name="name"]', tag);
  await page.fill('input[name="dob"]', "2025-06-01");
  await page.fill('input[name="weight"]', "80");
  await page.fill('input[name="pen"]', pen);
  await clickAndWait(page, 'button[type="submit"]:has-text("Save pig")');
}

// Owner + farm
await page.goto(base + "/signup");
await page.fill('input[name="farmName"]', "Feed Reverse Farm");
await page.fill('input[name="ownerName"]', "Reverse Owner");
await page.fill('input[name="email"]', "feedrev-owner@example.com");
await page.fill('input[name="password"]', "testpass123");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/app");

// Ration with 100 kg
await page.goto(base + "/app/feed");
await page.click('summary:has-text("+ New ration")');
await page.fill('input[name="feedType"]', "Grower");
await page.fill('form:has(button:has-text("Add ration")) input[name="stockKg"]', "100");
await page.fill('form:has(button:has-text("Add ration")) input[name="reorderLevelKg"]', "10");
await page.fill('form:has(button:has-text("Add ration")) input[name="costPerKg"]', "1");
await clickAndWait(page, 'button:has-text("Add ration")');
log("ration starts at 100 kg", (await stockOf()) === 100);

// --- Per-pig pen -----------------------------------------------------------
await addPig("REV-A", "Pen A");
await page.goto(base + "/app/feed");
await page.click('tr:has(td:text-is("Pen A")) summary:has-text("Assign feeding")');
await page.selectOption('tr:has(td:text-is("Pen A")) select[name="feedRation"]', "Grower");
await page.fill('tr:has(td:text-is("Pen A")) input[name="dailyFeedKg"]', "5");
await clickAndWait(page, 'tr:has(td:text-is("Pen A")) button:has-text("Save feeding")');

let t = await rowText("Pen A");
log("per-pig pen: no Reverse button before anything is logged", !/reverse/i.test(t));

await clickAndWait(page, 'tr:has(td:text-is("Pen A")) button:has-text("Log feeding")');
log("logging deducts 5 kg (100 -> 95)", (await stockOf()) === 95);
t = await rowText("Pen A");
log("per-pig pen shows Logged today + Reverse button", /logged today/i.test(t) && /reverse/i.test(t));

await clickAndWait(page, 'tr:has(td:text-is("Pen A")) button:has-text("Reverse")');
let body = await page.innerText("body");
log("reverse shows confirmation banner", /feeding reversed/i.test(body));
log("reverse puts the 5 kg back (95 -> 100)", (await stockOf()) === 100);
t = await rowText("Pen A");
log("pen shows Not logged again and Reverse button gone", /not logged/i.test(t) && !/reverse/i.test(t));
log("no calendar feed log rows remain", sql("select count(*) from feed_logs where source='calendar' and pen='Pen A'") === "0");

// Can log again (double-log guard released), then reverse from the movements list
await clickAndWait(page, 'tr:has(td:text-is("Pen A")) button:has-text("Log feeding")');
log("can log Pen A again after a reversal (100 -> 95)", (await stockOf()) === 95);
await page.goto(base + "/app/feed");
await clickAndWait(page, 'tr:has(td:has-text("Grower")):has(span:text-is("usage")) button:has-text("Reverse")');
log("reversing from the Feed movements list restores stock (95 -> 100)", (await stockOf()) === 100);

// Activity log
log("activity log records 'Reversed feeding'", Number(sql("select count(*) from activity_log where action='Reversed feeding'")) === 2);

// --- Bulk pen --------------------------------------------------------------
await addPig("REV-B", "Pen B");
await page.goto(base + "/app/feed");
await page.click('tr:has(td:text-is("Pen B")) summary:has-text("Assign feeding")');
await page.selectOption('tr:has(td:text-is("Pen B")) select:not([name])', "bulk");
await page.selectOption('tr:has(td:text-is("Pen B")) select[name="bulkFeedType"]', "Grower");
await page.fill('tr:has(td:text-is("Pen B")) input[name="bulkTotalWeight"]', "20");
await page.fill('tr:has(td:text-is("Pen B")) input[name="bulkDurationValue"]', "2");
await page.selectOption('tr:has(td:text-is("Pen B")) select[name="bulkDurationUnit"]', "days");
await clickAndWait(page, 'tr:has(td:text-is("Pen B")) button:has-text("Save feeding")');

// Backdate the cycle so the pen is overdue and loggable
sql("update pen_feed_plans set start_date = now() - interval '5 days' where pen='Pen B'");
await page.goto(base + "/app/feed");
t = await rowText("Pen B");
log("bulk pen is overdue before logging", /overdue/i.test(t), t.replace(/\s+/g, " "));

await clickAndWait(page, 'tr:has(td:text-is("Pen B")) button:has-text("Log feeding")');
log("bulk top-up deducts 20 kg (100 -> 80)", (await stockOf()) === 80);
t = await rowText("Pen B");
log("bulk pen now Due in 2d with a Reverse button", /due in 2d/i.test(t) && /reverse/i.test(t), t.replace(/\s+/g, " "));

await clickAndWait(page, 'tr:has(td:text-is("Pen B")) button:has-text("Reverse")');
log("bulk reverse restores 20 kg (80 -> 100)", (await stockOf()) === 100);
t = await rowText("Pen B");
log("bulk pen is due again (cycle rewound) and Log feeding is enabled", /due today|overdue/i.test(t) && !(await page.isDisabled('tr:has(td:text-is("Pen B")) button:has-text("Log feeding")')), t.replace(/\s+/g, " "));
log("no calendar logs left for Pen B", sql("select count(*) from feed_logs where source='calendar' and pen='Pen B'") === "0");

// Dashboard / bell count treats the reversed bulk pen as due again
await page.goto(base + "/app");
body = await page.innerText("body");
log("dashboard shows Pen B needing a top-up again", /pen b/i.test(body));

// --- Permissions -----------------------------------------------------------
await page.goto(base + "/app/feed");
await clickAndWait(page, 'tr:has(td:text-is("Pen A")) button:has-text("Log feeding")');
log("owner sees Reverse button for Pen A", (await page.locator('button:has-text("Reverse")').count()) >= 1);
await page.goto(base + "/app/team");
for (const [name, role, email] of [["Rev Manager", "manager", "feedrev-mgr@example.com"], ["Rev Worker", "worker", "feedrev-wrk@example.com"]]) {
  await page.fill('input[name="name"]', name);
  await page.selectOption('select[name="role"]', role);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "workerpass1");
  await page.click('button[type="submit"]:has-text("Add account")');
  await page.waitForFunction((n) => document.body.innerText.includes(n), name, { timeout: 10000 });
}
for (const [label, email] of [["manager", "feedrev-mgr@example.com"], ["worker", "feedrev-wrk@example.com"]]) {
  const p2 = await (await browser.newContext()).newPage();
  await p2.goto(base + "/login");
  await p2.fill('input[name="email"]', email);
  await p2.fill('input[name="password"]', "workerpass1");
  await p2.click('button[type="submit"]');
  await p2.waitForURL(base + "/app");
  await p2.goto(base + "/app/feed");
  const b = await p2.innerText("body");
  const reverseBtns = await p2.locator('button:has-text("Reverse")').count();
  log(`${label} sees the logged feeding but no Reverse button`, /logged today/i.test(b) && reverseBtns === 0, `buttons=${reverseBtns}`);
}

await browser.close();

// Cleanup test farm
const farmId = sql("select id from farms where name='Feed Reverse Farm'");
if (farmId) {
  for (const tbl of ["activity_log", "feed_logs", "pen_feed_plans", "feed_inventory", "pigs", "users"]) {
    try { sql(`delete from ${tbl} where farm_id='${farmId}'`); } catch (e) { console.log("cleanup skip", tbl); }
  }
  try { sql(`delete from farms where id='${farmId}'`); } catch (e) { console.log("farm cleanup failed"); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
