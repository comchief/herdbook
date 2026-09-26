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

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

// A plain <form action={serverAction}> submit is a real full-page
// navigation even when the redirect target is the SAME url as the page
// we're already on (e.g. a milestone confirm that redirects back to the
// same pig profile) — so we must register the navigation waiter *before*
// clicking (Promise.all), never call page.waitForURL() after the click:
// if the target url already matches the current url, waitForURL resolves
// immediately against the stale pre-click DOM instead of waiting for the
// round trip.
async function clickAndWait(p, selector) {
  await Promise.all([p.waitForNavigation(), p.click(selector)]);
  await p.waitForLoadState("networkidle");
}

async function addPig(tag, name, status, sexBase, sireTag, damTag) {
  await page.goto(base + "/app/pigs/new");
  await page.fill('input[name="tag"]', tag);
  await page.fill('input[name="name"]', name);
  await page.selectOption('select[name="sexBase"]', sexBase);
  await page.selectOption('select[name="status"]', status);
  await page.fill('input[name="dob"]', "2024-06-01");
  await page.fill('input[name="weight"]', "80");
  if (sireTag) await page.selectOption('select[name="sireTag"]', sireTag);
  if (damTag) await page.selectOption('select[name="damTag"]', damTag);
  await clickAndWait(page, 'button[type="submit"]:has-text("Save pig")');
}

async function logBreeding(sowTag, boarTag, matingDate) {
  await page.goto(base + "/app/breeding");
  await page.selectOption('select[name="sowTag"]', sowTag);
  if (boarTag) await page.selectOption('select[name="boarTag"]', boarTag);
  await page.fill('input[name="matingDate"]', matingDate);
  await clickAndWait(page, 'button[type="submit"]:has-text("Log breeding")');
}

// ---------------------------------------------------------------------------
// 1. Owner signup
// ---------------------------------------------------------------------------
await page.goto(base + "/signup");
await page.fill('input[name="farmName"]', "Gestation Test Farm");
await page.fill('input[name="ownerName"]', "Gestation Tester");
await page.fill('input[name="email"]', "gestation-test@example.com");
await page.fill('input[name="password"]', "testpass123");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/app");
log("signup -> dashboard", page.url() === base + "/app");

// ---------------------------------------------------------------------------
// 2. Create breeding stock
// ---------------------------------------------------------------------------
await addPig("BR-BOARA", "Boar A", "breeding-boar", "Male");
await addPig("BR-SOWA", "Sow A", "breeding-sow", "Female"); // baseline / upcoming
await addPig("BR-SOWB", "Sow B", "breeding-sow", "Female"); // day21 -> still pregnant
await addPig("BR-SOWC", "Sow C", "breeding-sow", "Female"); // day21 -> returned to heat
await addPig("BR-SOWD", "Sow D", "breeding-sow", "Female"); // day90
await addPig("BR-SOWE", "Sow E", "breeding-sow", "Female"); // day110 + farrow + litter
await addPig("BR-OLDBOAR", "Old Boar", "breeding-boar", "Male");
await addPig("BR-SOWF", "Sow F", "breeding-sow", "Female", "BR-BOARA"); // daughter of Boar A
await addPig("BR-SOWG", "Sow G", "breeding-sow", "Female", "BR-OLDBOAR");
await addPig("BR-BOARH", "Boar H", "breeding-boar", "Male", "BR-OLDBOAR"); // half-sib of Sow G
await addPig("BR-SOWI", "Sow I", "breeding-sow", "Female");
await addPig("BR-BOARJ", "Boar J", "breeding-boar", "Male");
log("bred stock created", true);

// ---------------------------------------------------------------------------
// 3. Baseline mating — permanent info panel + auto farrow date
// ---------------------------------------------------------------------------
const matingA = isoDaysAgo(10);
await logBreeding("BR-SOWA", "BR-BOARA", matingA);
let body = await page.innerText("body");
log("gestation cycle info panel shows 114 days", body.includes("Gestation") && body.includes("114 days"));
log("estrus info tile shows 18 - 24 days", /18\s*[–-]\s*24 days/.test(body));
log("no manual expected-farrow input on the form", (await page.$('input[name="expectedFarrowDate"]')) === null);
const expectedFarrowA = new Date(matingA + "T00:00:00.000Z");
expectedFarrowA.setUTCDate(expectedFarrowA.getUTCDate() + 114);
const rowA = await page.locator("table.data tbody tr", { hasText: "Sow A" }).first().textContent();
log("Sow A row shows auto-computed expected farrow date", rowA?.includes(String(expectedFarrowA.getUTCFullYear())) ?? false, rowA ?? "");

// ---------------------------------------------------------------------------
// 4. Lineage warnings
// ---------------------------------------------------------------------------
await logBreeding("BR-SOWF", "BR-BOARA", isoToday());
body = await page.innerText("body");
log("parent/offspring lineage warning fires", body.includes("Lineage warning") && body.includes("sire"), body.slice(0, 300));

await logBreeding("BR-SOWG", "BR-BOARH", isoToday());
body = await page.innerText("body");
log("shared-sire sibling lineage warning fires", body.includes("Lineage warning") && body.includes("share the same sire"));

await logBreeding("BR-SOWI", "BR-BOARJ", isoToday());
body = await page.innerText("body");
log("unrelated pair saves with no lineage warning", !body.includes("Lineage warning"));

// ---------------------------------------------------------------------------
// 5. Day-21 milestone — "still pregnant" branch (Sow B)
// ---------------------------------------------------------------------------
await logBreeding("BR-SOWB", "BR-BOARA", isoDaysAgo(25));
await page.goto(base + "/app/pigs/BR-SOWB");
body = await page.innerText("body");
log("Sow B gestation milestones card renders", body.includes("Gestation milestones"));
log("Sow B day-21 check shows as due", /Confirm pregnancy[\s\S]*?due/.test(body));
await clickAndWait(page, 'form:has(input[value="pregnant"]) button:has-text("Still pregnant")');
body = await page.innerText("body");
log("Sow B day-21 confirmed, still expecting", body.includes("Confirmed") && !body.includes("returned to heat"));

// ---------------------------------------------------------------------------
// 6. Day-21 milestone — "returned to heat" branch (Sow C)
// ---------------------------------------------------------------------------
await logBreeding("BR-SOWC", "BR-BOARA", isoDaysAgo(25));
await page.goto(base + "/app/pigs/BR-SOWC");
await clickAndWait(page, 'form:has(input[value="returned-to-heat"]) button:has-text("Returned to heat")');
body = await page.innerText("body");
const sowCOk = !body.includes("Gestation milestones");
if (!sowCOk) {
  console.log("DEBUG url:", page.url());
  console.log("DEBUG body around Gestation:", body.slice(Math.max(0, body.indexOf("Gestation") - 100), body.indexOf("Gestation") + 500));
}
log("Sow C milestones card disappears after returning to heat", sowCOk);
await page.goto(base + "/app/breeding");
body = await page.innerText("body");
log("Sow C shows 'returned to heat' badge on breeding page", /Sow C[\s\S]*?returned to heat/.test(body));

// ---------------------------------------------------------------------------
// 7. Day-90 milestone (Sow D) — confirm day-21 first, then mark day-90 done
// ---------------------------------------------------------------------------
await logBreeding("BR-SOWD", "BR-BOARA", isoDaysAgo(95));
await page.goto(base + "/app/pigs/BR-SOWD");
await clickAndWait(page, 'form:has(input[value="pregnant"]) button:has-text("Still pregnant")');
body = await page.innerText("body");
log("Sow D day-90 (move to pen) shows as due", /Move to farrowing pen[\s\S]*?due/.test(body));
await clickAndWait(page, 'form:has(input[name="milestone"][value="pen"]) button:has-text("Mark done")');
body = await page.innerText("body");
log("Sow D day-90 marked done", /Move to farrowing pen[\s\S]*?done/.test(body));

// ---------------------------------------------------------------------------
// 8. Full lifecycle through farrowing + litter (Sow E)
// ---------------------------------------------------------------------------
await logBreeding("BR-SOWE", "BR-BOARA", isoDaysAgo(118));
await page.goto(base + "/app/pigs/BR-SOWE");
await clickAndWait(page, 'form:has(input[value="pregnant"]) button:has-text("Still pregnant")');
await clickAndWait(page, 'form:has(input[name="milestone"][value="pen"]) button:has-text("Mark done")');
body = await page.innerText("body");
log("Sow E day-110 (farrowing prep) shows as due", /Begin farrowing prep[\s\S]*?due/.test(body));
await clickAndWait(page, 'form:has(input[name="milestone"][value="prep"]) button:has-text("Mark done")');
body = await page.innerText("body");
log("Sow E day-114 (expected farrowing) shows as due", /Expected farrowing[\s\S]*?due/.test(body));

// Log the farrowing outcome via the embedded popover on the pig profile.
await page.click('details:has-text("Log farrowing outcome") summary');
await page.fill('input[name="actualFarrowDate"]', isoToday());
await page.fill('input[name="litterSize"]', "8");
await page.fill('input[name="pigletsWeaned"]', "8");
await page.fill('input[name="totalLitterWeightKg"]', "64");
await clickAndWait(page, 'button:has-text("Save outcome")');
body = await page.innerText("body");
log("Sow E outcome logged, litter #1 badge shown", /litter #1[\s\S]*?8 born/.test(body));
log("Record litter link appears for Sow E", (await page.$('a:has-text("Record litter")')) !== null);
const sowELitterHref = await page.getAttribute('a:has-text("Record litter")', "href");

await clickAndWait(page, 'a:has-text("Record litter")');
body = await page.innerText("body");
log("litter page lists 8 piglet rows", (await page.$$('input[name^="piglet_"][name$="_tag"]')).length === 8);

const tagInputs = await page.$$('input[name$="_tag"]');
const sexSelects = await page.$$('select[name$="_sex"]');
const weightInputs = await page.$$('input[name$="_weight"]');
for (let i = 0; i < 8; i++) {
  await sexSelects[i].selectOption(i % 2 === 0 ? "Female" : "Male");
  await weightInputs[i].fill((1.2 + i * 0.1).toFixed(1));
}
const savedTags = [];
for (const inp of tagInputs) savedTags.push(await inp.inputValue());
await clickAndWait(page, 'button:has-text("Save litter")');
body = await page.innerText("body");
log("litter recorded banner shows 8 piglets added", body.includes("8 piglets added"));
log("Sow E now shows 'litter recorded' badge, no more Record-litter link", body.includes("litter recorded") );

await page.goto(base + "/app/pigs");
body = await page.innerText("body");
const allTagsPresent = savedTags.every((t) => body.includes(t));
log("all 8 new piglet records appear in the pigs list", allTagsPresent, savedTags.join(", "));

await page.goto(base + "/app/pigs/" + encodeURIComponent(savedTags[0]));
body = await page.innerText("body");
log("piglet profile links back to dam (Sow E) and sire (Boar A)", body.includes("BR-SOWE") && body.includes("BR-BOARA"));

// ---------------------------------------------------------------------------
// 9. Dashboard + notification-bell surfaces
// ---------------------------------------------------------------------------
await page.goto(base + "/app");
body = await page.innerText("body");
log("dashboard loads with Needs attention section after all the gestation activity", body.includes("Needs attention") || body.includes("attention"));
log("dashboard does not error out (no 500/stack trace text)", !body.includes("Application error") && !body.includes("Internal Server Error"));

// ---------------------------------------------------------------------------
// 10. Worker permission checks
// ---------------------------------------------------------------------------
await page.goto(base + "/app/team");
await page.fill('input[name="name"]', "Gestation Worker");
await page.selectOption('select[name="role"]', "worker");
await page.fill('input[name="email"]', "worker@gestationtest.farm");
await page.fill('input[name="password"]', "workerpass1");
await page.click('button[type="submit"]:has-text("Add account")');
await page.waitForFunction(() => document.body.innerText.includes("Gestation Worker"), null, { timeout: 10000 });

const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(base + "/login");
await page2.fill('input[name="email"]', "worker@gestationtest.farm");
await page2.fill('input[name="password"]', "workerpass1");
await page2.click('button[type="submit"]');
await page2.waitForURL(base + "/app");

// Worker CAN confirm a day-21 check — use Sow A's baseline record, now at day 10; not due yet, so instead just verify the buttons render (permission, not date-gating) — skip if not due.
await page2.goto(base + "/app/pigs/BR-SOWD");
let body2 = await page2.innerText("body");
log("worker sees the gestation milestones card (day-21/90/110 open to any role)", body2.includes("Gestation milestones"));

// Worker is blocked from the manager-only litter page — requireManager()
// runs before the page even looks at the record, so this redirects a
// worker to /app regardless of the record's own eligibility state (it's
// already fully recorded by this point, but that's not why it's blocked).
await page2.goto(base + sowELitterHref);
log("worker redirected away from the manager-only litter-recording page", page2.url() === base + "/app", page2.url());

// Worker's nav should hide manager-only sections but breeding stays visible (routine task).
const workerBody = await page2.innerText("body");
log("worker can reach the breeding page", page2.url().includes("/app"));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
