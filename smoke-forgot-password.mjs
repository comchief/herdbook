import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const newPage = async () => (await browser.newContext()).newPage();

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
// With RESEND_API_KEY unset (local dev) the email is logged to the dev server's console.
const linksInLog = () => [...fs.readFileSync("/tmp/nextdev.log", "utf8").matchAll(/reset-password\?token=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function requestReset(p, email) {
  await p.goto(base + "/forgot-password");
  await p.fill('input[name="email"]', email);
  await clickAndWait(p, 'button:has-text("Send reset link")');
  return p.innerText("body");
}

const EMAIL = "fp-test@example.com";
// --- account to reset ---
const owner = await newPage();
await owner.goto(base + "/signup");
await owner.fill('input[name="farmName"]', "Forgot Password Farm");
await owner.fill('input[name="ownerName"]', "Forgot Tester");
await owner.fill('input[name="email"]', EMAIL);
await owner.fill('input[name="password"]', "oldpass123");
await owner.click('button[type="submit"]');
await owner.waitForURL(base + "/app");

// --- login page entry point ---
const p = await newPage();
await p.goto(base + "/login");
log("login page has a Forgot password? link", (await p.locator('a:has-text("Forgot password?")').count()) === 1);
// Next <Link> navigates client-side, so waitForNavigation would never fire;
// the target URL differs from the current one, so waitForURL is safe here.
await p.click('a:has-text("Forgot password?")');
await p.waitForURL(base + "/forgot-password");
log("link goes to /forgot-password", p.url() === base + "/forgot-password");

// --- request: unknown vs known email give the same message ---
const before = linksInLog().length;
let body = await requestReset(p, "nobody-here@example.com");
const unknownMsg = body.match(/If that email has an account[^.]*\./)?.[0];
log("unknown email gets the generic confirmation", !!unknownMsg);
await sleep(500);
log("no token or email created for an unknown address", linksInLog().length === before);

body = await requestReset(p, EMAIL.toUpperCase());
log("known email (any case) gets the identical confirmation", body.match(/If that email has an account[^.]*\./)?.[0] === unknownMsg);
await sleep(800);
const links = linksInLog();
log("exactly one reset link was emailed (logged in dev)", links.length === before + 1);
const token1 = links[links.length - 1];
log("token is stored hashed, not in plaintext", sql(`select count(*) from password_reset_tokens where token_hash='${token1}'`) === "0" && sql("select count(*) from password_reset_tokens") === "1");

// --- cooldown ---
await requestReset(p, EMAIL);
await sleep(500);
log("a second request within a minute does not issue another link", linksInLog().length === before + 1 && sql("select count(*) from password_reset_tokens") === "1");

// --- a newer link voids the older one ---
sql("update password_reset_tokens set created_at = created_at - interval '5 minutes'");
await requestReset(p, EMAIL);
await sleep(800);
const token2 = linksInLog().pop();
log("after the cooldown a new link is issued", token2 && token2 !== token1);
const q = await newPage();
await q.goto(`${base}/reset-password?token=${token1}`);
log("the older link is now void", /expired or was already used/i.test(await q.innerText("body")));
await q.goto(`${base}/reset-password?token=garbage`);
log("a made-up token is rejected", /expired or was already used/i.test(await q.innerText("body")));

// --- expired links ---
sql(`update password_reset_tokens set expires_at = now() - interval '1 minute' where used_at is null`);
await q.goto(`${base}/reset-password?token=${token2}`);
log("an expired link is rejected", /expired or was already used/i.test(await q.innerText("body")));
sql("update password_reset_tokens set created_at = created_at - interval '5 minutes'");
await requestReset(p, EMAIL);
await sleep(800);
const token3 = linksInLog().pop();

// --- reset ---
await q.goto(`${base}/reset-password?token=${token3}`);
log("a valid link shows the new-password form", (await q.locator('input[name="newPassword"]').count()) === 1);
await q.fill('input[name="newPassword"]', "brandnew789");
await q.fill('input[name="confirmPassword"]', "different789");
await clickAndWait(q, 'button:has-text("Update password")');
log("mismatched passwords are refused with a message", /don.t match/i.test(await q.innerText("body")));
log("token still usable after a failed attempt", (await q.locator('input[name="newPassword"]').count()) === 1);
await q.fill('input[name="newPassword"]', "brandnew789");
await q.fill('input[name="confirmPassword"]', "brandnew789");
await clickAndWait(q, 'button:has-text("Update password")');
log("success lands on login with a confirmation", q.url().startsWith(base + "/login") && /password updated/i.test(await q.innerText("body")));

// --- old vs new password ---
const l1 = await newPage();
await l1.goto(base + "/login");
await l1.fill('input[name="email"]', EMAIL);
await l1.fill('input[name="password"]', "oldpass123");
await clickAndWait(l1, 'button[type="submit"]');
log("old password no longer works", /incorrect email or password/i.test(await l1.innerText("body")));
await l1.fill('input[name="email"]', EMAIL);
await l1.fill('input[name="password"]', "brandnew789");
await Promise.all([l1.waitForURL(base + "/app"), l1.click('button[type="submit"]')]);
log("new password logs in", l1.url() === base + "/app");

// --- single use ---
await q.goto(`${base}/reset-password?token=${token3}`);
log("the used link can't be reused", /expired or was already used/i.test(await q.innerText("body")));
log("all of the account's tokens are spent", sql("select count(*) from password_reset_tokens where used_at is null") === "0");

await browser.close();

// cleanup
const farmId = sql("select id from farms where name='Forgot Password Farm'");
if (farmId) {
  for (const tbl of ["activity_log", "users"]) { try { sql(`delete from ${tbl} where farm_id='${farmId}'`); } catch (e) {} }
  try { sql(`delete from farms where id='${farmId}'`); } catch (e) {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
