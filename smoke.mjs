import { chromium } from "playwright";

const base = "http://localhost:3400";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

function log(step, ok, extra = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${step} ${extra}`);
}

// 1. Owner signup (becomes platform admin since email matches PLATFORM_ADMIN_EMAIL)
await page.goto(base + "/signup");
await page.fill('input[name="farmName"]', "Whistledown Farm");
await page.fill('input[name="ownerName"]', "Jo McAllister");
await page.fill('input[name="email"]', "mjerme@gmail.com");
await page.fill('input[name="password"]', "supersecret1");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/app");
log("signup -> dashboard", page.url() === base + "/app", page.url());

const dashText = await page.textContent("body");
log("dashboard shows farm name", dashText.includes("Whistledown Farm"));

// 2. Add a pig
await page.goto(base + "/app/pigs/new");
await page.fill('input[name="tag"]', "PB-0001");
await page.fill('input[name="name"]', "Nutmeg");
await page.fill('input[name="dob"]', "2025-01-01");
await page.fill('input[name="weight"]', "45");
await page.click('button[type="submit"]:has-text("Save pig")');
await page.waitForURL(base + "/app/pigs");
const pigsText = await page.textContent("body");
log("pig created and listed", pigsText.includes("Nutmeg") && pigsText.includes("PB-0001"));

// 3. Team accounts - add a worker
await page.goto(base + "/app/team");
await page.fill('input[name="name"]', "Sam Rivera");
await page.selectOption('select[name="role"]', "worker");
await page.fill('input[name="email"]', "sam@whistledown.farm");
await page.fill('input[name="password"]', "workerpass1");
await page.click('button[type="submit"]:has-text("Add account")');
await page.waitForFunction(() => document.body.innerText.includes("Sam Rivera"), null, { timeout: 10000 });
const teamText = await page.textContent("body");
log("worker account created", teamText.includes("Sam Rivera") && teamText.includes("worker"));

// 4. Admin: set bank details
await page.goto(base + "/admin/bank-details");
await page.fill('input[name="bankName"]', "NCB Jamaica");
await page.fill('input[name="accountName"]', "Herdbook Ltd");
await page.fill('input[name="accountNumber"]', "123456789");
await page.click('button[type="submit"]');
await page.waitForURL((u) => u.toString().includes("saved=1"));
log("bank details saved", true);

// 5. Billing page shows bank details + trial status
await page.goto(base + "/app/billing");
const billingText = await page.textContent("body");
log("billing shows trial + bank info", billingText.includes("days left") && billingText.includes("NCB Jamaica"));

// 6. Submit a payment
await page.fill('input[name="payerName"]', "Jo McAllister");
await page.fill('input[name="bankReference"]', "TXN-9988");
await page.click('button[type="submit"]:has-text("Submit for confirmation")');
await page.waitForURL((u) => u.toString().includes("submitted=1"));
log("payment submitted", true);

// 7. Admin approves the payment
await page.goto(base + "/admin");
const adminText = await page.textContent("body");
log("admin sees pending payment", adminText.includes("Whistledown Farm") && adminText.includes("TXN-9988"));
await page.click('button:has-text("Approve")');
await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("No payments waiting for review."), null, { timeout: 10000 });
const adminAfter = await page.textContent("main");
log("payment approved, no longer pending", !adminAfter.includes("TXN-9988") || adminAfter.includes("approved"));

// 8. Billing page now shows active / paid through
await page.goto(base + "/app/billing");
const billingAfter = await page.textContent("body");
log("billing shows Active after approval", billingAfter.includes("Paid through"));

// 9. Worker login sees restricted nav (no Sales/Expenses/Team/Billing links) and dashboard
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(base + "/login");
await page2.fill('input[name="email"]', "sam@whistledown.farm");
await page2.fill('input[name="password"]', "workerpass1");
await page2.click('button[type="submit"]');
await page2.waitForURL(base + "/app");
const workerNav = await page2.textContent("aside");
log("worker nav hides Sales/Expenses/Billing", !workerNav.includes("Slaughter") && !workerNav.includes("Expenses") && !workerNav.includes("Billing"));

// worker tries to access /app/sales directly -> should redirect to /app (guard)
await page2.goto(base + "/app/sales");
log("worker blocked from /app/sales", page2.url() === base + "/app", page2.url());

// worker can log a medical record
await page2.goto(base + "/app/medical");
await page2.selectOption('select[name="pigTag"]', "PB-0001");
await page2.fill('input[name="date"]', "2026-09-20");
await page2.fill('textarea[name="description"]', "Minor leg scrape, cleaned and dressed");
await page2.click('button[type="submit"]:has-text("Save record")');
await page2.waitForFunction(() => document.querySelector("main")?.innerText.includes("Minor leg scrape"), null, { timeout: 10000 });
const medText = await page2.textContent("main");
log("worker can log medical record", medText.includes("Minor leg scrape"));

await browser.close();
console.log("DONE");
