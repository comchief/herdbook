import { chromium } from "playwright";

const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

let pass = 0, fail = 0;
function log(step, ok, extra = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${step} ${extra}`);
  if (ok) pass++; else fail++;
}

async function clickAndWait(p, selector) {
  await Promise.all([p.waitForNavigation(), p.click(selector)]);
  await p.waitForLoadState("networkidle");
}

// 1. Owner signup
await page.goto(base + "/signup");
await page.fill('input[name="farmName"]', "Capital Test Farm");
await page.fill('input[name="ownerName"]', "Capital Tester");
await page.fill('input[name="email"]', "capital-test@example.com");
await page.fill('input[name="password"]', "testpass123");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/app");
log("signup -> dashboard", page.url() === base + "/app");

// 2. Expenses page shows the new Investment capital section, starting empty
await page.goto(base + "/app/expenses");
let body = await page.innerText("body");
log("Investment capital heading renders", body.includes("Investment capital"));
log("Total invested tile starts at 0", /total invested, all-time[\s\S]{0,20}\$0\b/i.test(body));
log("Log investment capital form renders", body.includes("Log investment capital") && /source/i.test(body));
log("Empty-state row shows before any contribution", body.includes("No investment capital logged yet."));

// 3. Log a contribution (owner equity)
await page.selectOption('form:has(button:has-text("Save contribution")) select[name="type"]', "owner-equity");
await page.fill('form:has(button:has-text("Save contribution")) input[name="date"]', "2026-01-15");
await page.fill('form:has(button:has-text("Save contribution")) input[name="source"]', "Capital Tester");
await page.fill('form:has(button:has-text("Save contribution")) input[name="notes"]', "Initial seed capital");
await page.fill('form:has(button:has-text("Save contribution")) input[name="amount"]', "5000");
await clickAndWait(page, 'button:has-text("Save contribution")');
body = await page.innerText("body");
log("Contribution appears in the table", body.includes("Capital Tester") && body.includes("Initial seed capital") && body.includes("Owner equity"));
log("Total invested tile updates to $5,000", /total invested, all-time[\s\S]{0,20}\$5,000/i.test(body));
log("Invested YTD tile updates to $5,000", /invested, ytd[\s\S]{0,20}\$5,000/i.test(body));

// 4. Log a second contribution (a loan) dated last year, to check YTD excludes it
await page.selectOption('form:has(button:has-text("Save contribution")) select[name="type"]', "loan");
await page.fill('form:has(button:has-text("Save contribution")) input[name="date"]', "2025-06-01");
await page.fill('form:has(button:has-text("Save contribution")) input[name="source"]', "NCB Jamaica");
await page.fill('form:has(button:has-text("Save contribution")) input[name="amount"]', "2000");
await clickAndWait(page, 'button:has-text("Save contribution")');
body = await page.innerText("body");
log("Second (loan) contribution appears", body.includes("NCB Jamaica") && body.includes("Loan"));
log("Total invested tile sums both ($7,000)", /total invested, all-time[\s\S]{0,20}\$7,000/i.test(body));
log("Invested YTD tile still shows only the 2026 one ($5,000)", /invested, ytd[\s\S]{0,20}\$5,000/i.test(body));

// 5. Profit/loss YTD must be unaffected by capital contributions (no expenses/sales logged, so should be $0)
log("Profit / loss, YTD stays at $0 (capital doesn't leak into it)", /profit \/ loss, ytd[\s\S]{0,20}\$0\b/i.test(body));

// 6. Delete the loan contribution and confirm it's gone + totals update
await clickAndWait(page, 'tr:has-text("NCB Jamaica") button:has-text("Delete")');
body = await page.innerText("body");
log("Deleted contribution no longer listed", !body.includes("NCB Jamaica"));
log("Total invested tile drops back to $5,000 after delete", /total invested, all-time[\s\S]{0,20}\$5,000/i.test(body));

// 7. Worker cannot reach the Expenses page at all (requireManager gate, pre-existing behavior — sanity check it still holds)
await page.goto(base + "/app/team");
await page.fill('input[name="name"]', "Capital Worker");
await page.selectOption('select[name="role"]', "worker");
await page.fill('input[name="email"]', "worker@capitaltest.farm");
await page.fill('input[name="password"]', "workerpass1");
await page.click('button[type="submit"]:has-text("Add account")');
await page.waitForFunction(() => document.body.innerText.includes("Capital Worker"), null, { timeout: 10000 });

const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(base + "/login");
await page2.fill('input[name="email"]', "worker@capitaltest.farm");
await page2.fill('input[name="password"]', "workerpass1");
await page2.click('button[type="submit"]');
await page2.waitForURL(base + "/app");
await page2.goto(base + "/app/expenses");
log("worker redirected away from Expenses (unchanged gating)", page2.url() === base + "/app", page2.url());

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
