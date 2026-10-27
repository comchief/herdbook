import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

/** One row per subscribing farm (tenant). Every business table below
 * carries a farmId and every query in the app is scoped to the signed-in
 * user's farm — see src/lib/session.ts / src/lib/tenant.ts. */
export const farms = pgTable("farms", {
  id: id(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  unit: text("unit").notNull().default("kg"), // "kg" | "lbs"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at").notNull(),
  paidThroughDate: timestamp("paid_through_date"),
  // Set together from a single geocode lookup when the owner saves a
  // location in Farm settings (see src/lib/weather.ts) — never edited by
  // hand. locationName is the resolved display label ("Kingston,
  // Jamaica"), not necessarily what they typed. Powers the dashboard's
  // local greeting time and weather summary; all null until set.
  locationName: text("location_name"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  timezone: text("timezone"), // IANA name, e.g. "America/Jamaica"
});

export const users = pgTable(
  "users",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("worker"), // "owner" | "manager" | "worker"
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    // Profile photo, stored as a data: URL (small images only — see the 2MB
    // cap in updateAvatarAction) rather than an external object store, so
    // the feature needs no file-hosting infrastructure of its own.
    avatarUrl: text("avatar_url"),
    // Set when the account holder submits the "Delete account" request on
    // their profile page. Deletion is a manual follow-up (never automatic —
    // for an owner it would take their whole farm's data with it), so this
    // just timestamps the request for review; it's cleared if they cancel.
    deletionRequestedAt: timestamp("deletion_requested_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_farm_idx").on(t.farmId)]
);

export const pigs = pgTable(
  "pigs",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    name: text("name").notNull(),
    breed: text("breed"),
    sexBase: text("sex_base").notNull(),
    // Nullable: a pig can be tracked by acquiredDate alone when its birth
    // date is unknown (e.g. purchased stock) — see acquiredDate below.
    dob: timestamp("dob"),
    status: text("status").notNull(),
    pen: text("pen"),
    currentWeightKg: doublePrecision("current_weight_kg").notNull().default(0),
    sireTag: text("sire_tag"),
    damTag: text("dam_tag"),
    targetWeightKg: doublePrecision("target_weight_kg"),
    targetMonths: doublePrecision("target_months"),
    acquiredDate: timestamp("acquired_date"),
    notes: text("notes"),
    photoUrl: text("photo_url"),
    feedRation: text("feed_ration"),
    dailyFeedKg: doublePrecision("daily_feed_kg"),
    weightLog: jsonb("weight_log").notNull().default([]),
    changeLog: jsonb("change_log").notNull().default([]),
    // Set only for a piglet created through the litter workflow (see
    // recordLitterAction in src/lib/actions/breeding.ts) — points back at
    // the breeding record whose farrowing produced it, so littermates can
    // be found later. Null for every pig added by hand. onDelete "set
    // null" (not cascade): deleting the breeding record shouldn't delete
    // pigs that were actually born.
    breedingRecordId: text("breeding_record_id").references(() => breedingRecords.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pigs_farm_tag_idx").on(t.farmId, t.tag),
    index("pigs_farm_idx").on(t.farmId),
    index("pigs_breeding_record_idx").on(t.breedingRecordId),
  ]
);

/** A farm's own list of pig breeds, offered on the "Add/edit a pig" Breed
 * dropdown. Seeded with DEFAULT_BREEDS (src/lib/breeds.ts) when a farm
 * signs up (see signupAction) so every farm starts with the same built-in
 * set already there as ordinary rows — the owner can then rename or delete
 * any of them from Farm settings exactly like one they added themselves.
 * A farm can end up with zero rows if every breed is deleted; the pig
 * forms handle that (see src/app/app/pigs/new and .../[tag]/edit). */
export const pigBreeds = pgTable(
  "pig_breeds",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pig_breeds_farm_name_idx").on(t.farmId, t.name), index("pig_breeds_farm_idx").on(t.farmId)]
);

/** A farm's own list of medications it keeps on hand, with a note on what
 * each is used for. Managed from Farm settings; offered as a picker on the
 * health page whenever a "Medication" record is logged (see
 * src/lib/actions/medical.ts and the medical page's type dropdown). Starts
 * empty for every farm — unlike pigBreeds there's no sensible built-in
 * list to pre-load here. */
export const medications = pgTable(
  "medications",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    use: text("use"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("medications_farm_name_idx").on(t.farmId, t.name), index("medications_farm_idx").on(t.farmId)]
);

export const medicalRecords = pgTable(
  "medical_records",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    pigTag: text("pig_tag").notNull(),
    pigName: text("pig_name"),
    date: timestamp("date").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    // Set only when type === "medication" — the chosen medication's name,
    // denormalized (like pigName) so the record still reads correctly even
    // if that medication is later renamed or deleted from Farm settings.
    medicationName: text("medication_name"),
    administeredBy: text("administered_by"),
    cost: doublePrecision("cost").notNull().default(0),
    nextDueDate: timestamp("next_due_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("medical_farm_idx").on(t.farmId)]
);

/** One row per mating, tracking a sow's gestation cycle end-to-end from
 * mating to farrowing. `status` is one of "confirmed-pregnant" (the
 * default — still gestating, whether or not the day-21 check has happened
 * yet), "farrowed", or "returned-to-heat" (the day-21 check found her back
 * in heat — the cycle is cancelled and this record is kept as a log, per
 * gestationMilestones in src/lib/gestation.ts). The four gestation
 * milestone booleans below (pregnancyCheckDone, movedToFarrowingPen,
 * farrowingPrepStarted, and actualFarrowDate itself) are what
 * gestationMilestones renders as the sow's timeline on her profile page —
 * see src/app/app/pigs/[tag]/page.tsx's "Gestation milestones" card. */
export const breedingRecords = pgTable(
  "breeding_records",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    sowTag: text("sow_tag").notNull(),
    sowName: text("sow_name"),
    boarTag: text("boar_tag"),
    boarName: text("boar_name"),
    matingDate: timestamp("mating_date").notNull(),
    // Auto-calculated at logging time as matingDate + 114 days (the swine
    // gestation rule — see GESTATION_DAYS in src/lib/gestation.ts). No
    // longer entered by hand.
    expectedFarrowDate: timestamp("expected_farrow_date").notNull(),
    actualFarrowDate: timestamp("actual_farrow_date"),
    litterSize: integer("litter_size"),
    pigletsWeaned: integer("piglets_weaned"),
    totalLitterWeightKg: doublePrecision("total_litter_weight_kg"),
    status: text("status").notNull().default("confirmed-pregnant"),
    notes: text("notes"),
    // Day-21 "did she come back into heat" check (confirmPregnancyCheckAction).
    pregnancyCheckDone: boolean("pregnancy_check_done").notNull().default(false),
    pregnancyCheckDate: timestamp("pregnancy_check_date"),
    returnedToHeat: boolean("returned_to_heat").notNull().default(false),
    // Day-90 / day-110 one-click milestones (markGestationMilestoneAction).
    movedToFarrowingPen: boolean("moved_to_farrowing_pen").notNull().default(false),
    movedToFarrowingPenDate: timestamp("moved_to_farrowing_pen_date"),
    farrowingPrepStarted: boolean("farrowing_prep_started").notNull().default(false),
    farrowingPrepStartedDate: timestamp("farrowing_prep_started_date"),
    // Assigned once, the first time farrowing is logged for this sow: the
    // count of her prior farrowed litters + 1. Not recomputed on a later
    // edit of the same outcome.
    litterNumber: integer("litter_number"),
    // True once the litter workflow (recordLitterAction) has actually
    // created the individual piglet pig rows for this farrowing — until
    // then, litterSize/totalLitterWeightKg are just the aggregate numbers
    // entered in the outcome form, unlinked to real pig records.
    litterRecorded: boolean("litter_recorded").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("breeding_farm_idx").on(t.farmId)]
);

/** One-time "forgot password" links. Only a SHA-256 hash of the token is
 * stored (the raw token exists only in the emailed link), so a database
 * leak can't be turned into working reset links. A token is valid until
 * expiresAt and only until it is used; requesting a new link voids older
 * unused ones (see src/lib/actions/password-reset.ts). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pwreset_token_hash_idx").on(t.tokenHash), index("pwreset_user_idx").on(t.userId)]
);

export const feedInventory = pgTable(
  "feed_inventory",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    feedType: text("feed_type").notNull(),
    stockKg: doublePrecision("stock_kg").notNull().default(0),
    reorderLevelKg: doublePrecision("reorder_level_kg").notNull().default(0),
    costPerKg: doublePrecision("cost_per_kg").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("feedinv_farm_type_idx").on(t.farmId, t.feedType),
    index("feedinv_farm_idx").on(t.farmId),
  ]
);

export const feedLogs = pgTable(
  "feed_logs",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    feedType: text("feed_type").notNull(),
    direction: text("direction").notNull(), // "purchase" | "usage"
    quantityKg: doublePrecision("quantity_kg").notNull(),
    costTotal: doublePrecision("cost_total").notNull().default(0),
    date: timestamp("date").notNull(),
    notes: text("notes"),
    source: text("source"), // "manual" | "calendar"
    // Set only for a usage log created by the "Log feeding" button on the
    // feed management page's feeding calendar (source === "calendar") — the
    // pen it was logged for, so the calendar can tell whether that pen has
    // already been confirmed fed today (per-pig) or this cycle (bulk). Null
    // for manually-logged movements, which aren't tied to a pen.
    pen: text("pen"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("feedlog_farm_idx").on(t.farmId)]
);

/** A pen fed "bulk" (ad-lib / unlimited) rather than by per-pig daily
 * amounts — e.g. self-feeders topped up periodically rather than
 * individually rationed. One row per (farmId, pen); its presence is what
 * marks that pen as bulk-fed (see the feed management page's "Assign
 * feeding" form, src/lib/actions/feed.ts's assignPenFeedAction). Unlike
 * per-pig feeding (pigs.feedRation/dailyFeedKg), the total is for the
 * whole pen, not per pig — durationDays is derived from
 * durationValue/durationUnit at save time (weeks × 7, months × 30.44,
 * matching the day-conversions used elsewhere in the app) so the feeding
 * calendar can show a daily-equivalent without redoing that math on every
 * render, while durationValue/durationUnit are kept as entered so the UI
 * can redisplay "2 weeks" rather than a conversion of it. */
export const penFeedPlans = pgTable(
  "pen_feed_plans",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    pen: text("pen").notNull(),
    feedType: text("feed_type").notNull(),
    totalWeightKg: doublePrecision("total_weight_kg").notNull(),
    durationValue: doublePrecision("duration_value").notNull(),
    durationUnit: text("duration_unit").notNull().default("days"), // "days" | "weeks" | "months"
    durationDays: doublePrecision("duration_days").notNull(),
    startDate: timestamp("start_date").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("penfeed_farm_pen_idx").on(t.farmId, t.pen), index("penfeed_farm_idx").on(t.farmId)]
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    pigTag: text("pig_tag"),
    channel: text("channel").notNull(), // "live" | "meat"
    liveWeightKg: doublePrecision("live_weight_kg"),
    carcassWeightKg: doublePrecision("carcass_weight_kg"),
    pricePerUnit: doublePrecision("price_per_unit").notNull().default(0),
    revenue: doublePrecision("revenue").notNull().default(0),
    buyer: text("buyer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sales_farm_idx").on(t.farmId)]
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    vendor: text("vendor"),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("expenses_farm_idx").on(t.farmId)]
);

/** Money put into the farm from outside its everyday operations — owner
 * equity, a loan drawdown, a grant, another investor's buy-in. Kept
 * entirely separate from expenses/revenue: it's financing, not an
 * operating cost, so it never touches the Profit/loss, YTD figure on the
 * Expense tracker page. Shown there as its own "Investment capital" card
 * with a running history, mirroring the expense log next to it. */
export const capitalContributions = pgTable(
  "capital_contributions",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    type: text("type").notNull(), // "owner-equity" | "loan" | "grant" | "other"
    source: text("source").notNull(), // who/where it came from, e.g. "Jo McAllister" or "NCB Jamaica"
    notes: text("notes"),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("capital_contributions_farm_idx").on(t.farmId)]
);

/** A farm's claim that it paid — reviewed by hand by the Herdbook operator
 * since there is no connected payment processor. Approving one pushes the
 * farm's paidThroughDate forward. */
export const paymentSubmissions = pgTable(
  "payment_submissions",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    amountClaimed: doublePrecision("amount_claimed").notNull(),
    currency: text("currency").notNull().default("USD"),
    periodMonths: integer("period_months").notNull().default(1),
    bankReference: text("bank_reference").notNull(),
    payerName: text("payer_name").notNull(),
    note: text("note"),
    status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
    reviewedById: text("reviewed_by_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("payments_farm_idx").on(t.farmId), index("payments_status_idx").on(t.status)]
);

/** Singleton row: the bank details farms are told to pay into. Editable by
 * the Herdbook operator from the platform admin screen. */
export const platformBankDetails = pgTable("platform_bank_details", {
  id: text("id").primaryKey().default("singleton"),
  bankName: text("bank_name").notNull().default(""),
  accountName: text("account_name").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  branch: text("branch").notNull().default(""),
  routingSwift: text("routing_swift").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** One row per farm-data write a signed-in user makes — the source for the
 * "activity" page an owner opens from a team member's card (see
 * src/app/app/team/[userId]/page.tsx). Written by src/lib/activity.ts's
 * logActivity(), called from the server actions after their write
 * succeeds; it never blocks or fails the action it's describing.
 *
 * userName is denormalized (like pigName/boarName elsewhere) so a log
 * entry still reads correctly after that person is renamed or removed
 * from the farm — userId is kept too, set null on removal (rather than
 * cascading the delete), so the activity page can still be reached by id
 * for whoever's left, but a removed user's own history isn't deleted
 * along with their account. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name").notNull(),
    action: text("action").notNull(), // short verb phrase, e.g. "Logged medical record"
    detail: text("detail").notNull(), // one-line human-readable description
    href: text("href"), // optional deep link back to the relevant page/record
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_farm_idx").on(t.farmId),
    index("activity_user_idx").on(t.userId),
    index("activity_farm_created_idx").on(t.farmId, t.createdAt),
  ]
);

/** Platform-wide growth-stage rules (Piglet/Weaner/Grower/Finisher), edited
 * by the Herdbook operator from the platform admin screen — see
 * src/lib/growth-rules.ts. One row per stage, keyed by stage name so an
 * upsert (onConflictDoUpdate on `stage`) is all a save needs.
 *
 * Each row is a self-contained age/weight band: `ageMinDays`–`ageMaxDays`
 * is how old a pig is during this stage, and `startWeight*`/`endWeight*`
 * are the expected weight range at the start and end of that window. The
 * app linearly interpolates between them to get an expected weight range
 * for a pig's exact current age, and classifies it on track/behind/overdue
 * against that — see stageForAgeDays()/expectedWeightRangeKg() in
 * growth-rules.ts. Weights are stored canonically in kg, same convention
 * as pigs.currentWeightKg.
 *
 * Missing rows (a fresh install, before the operator has saved anything)
 * fall back to DEFAULT_STAGE_RULES so growth tracking works out of the
 * box; a save only ever needs to write the stages being changed. */
export const growthStageRules = pgTable("growth_stage_rules", {
  stage: text("stage").primaryKey(), // "piglet" | "weaner" | "grower" | "finisher"
  order: integer("order").notNull(),
  ageMinDays: integer("age_min_days").notNull(),
  ageMaxDays: integer("age_max_days").notNull(),
  startWeightMinKg: doublePrecision("start_weight_min_kg").notNull(),
  startWeightMaxKg: doublePrecision("start_weight_max_kg").notNull(),
  endWeightMinKg: doublePrecision("end_weight_min_kg").notNull(),
  endWeightMaxKg: doublePrecision("end_weight_max_kg").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
