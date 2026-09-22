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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pigs_farm_tag_idx").on(t.farmId, t.tag), index("pigs_farm_idx").on(t.farmId)]
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
    administeredBy: text("administered_by"),
    cost: doublePrecision("cost").notNull().default(0),
    nextDueDate: timestamp("next_due_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("medical_farm_idx").on(t.farmId)]
);

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
    expectedFarrowDate: timestamp("expected_farrow_date").notNull(),
    actualFarrowDate: timestamp("actual_farrow_date"),
    litterSize: integer("litter_size"),
    pigletsWeaned: integer("piglets_weaned"),
    totalLitterWeightKg: doublePrecision("total_litter_weight_kg"),
    status: text("status").notNull().default("confirmed-pregnant"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("breeding_farm_idx").on(t.farmId)]
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("feedlog_farm_idx").on(t.farmId)]
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
