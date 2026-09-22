"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { setSessionCookie, clearSessionCookie, readSession } from "@/lib/session";
import { TRIAL_DAYS } from "@/lib/subscription";
import { revalidatePath } from "next/cache";

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export async function signupAction(formData: FormData) {
  const farmName = String(formData.get("farmName") || "").trim();
  const ownerName = String(formData.get("ownerName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!farmName || !ownerName || !email || password.length < 8) {
    redirect("/signup?error=" + encodeURIComponent("Fill in every field — passwords need at least 8 characters."));
  }

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    redirect("/signup?error=" + encodeURIComponent("An account with that email already exists."));
  }

  const now = new Date();
  const [farm] = await db
    .insert(schema.farms)
    .values({ name: farmName, trialEndsAt: addDays(now, TRIAL_DAYS) })
    .returning();

  const passwordHash = await hashPassword(password);
  const isPlatformAdmin =
    !!process.env.PLATFORM_ADMIN_EMAIL &&
    email === process.env.PLATFORM_ADMIN_EMAIL.trim().toLowerCase();

  const [user] = await db
    .insert(schema.users)
    .values({
      farmId: farm.id,
      name: ownerName,
      email,
      passwordHash,
      role: "owner",
      isPlatformAdmin,
    })
    .returning();

  await setSessionCookie({
    userId: user.id,
    farmId: farm.id,
    role: "owner",
    isPlatformAdmin,
  });

  redirect("/app");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=" + encodeURIComponent("Incorrect email or password."));
  }

  await setSessionCookie({
    userId: user!.id,
    farmId: user!.farmId,
    role: user!.role as "owner" | "manager" | "worker",
    isPlatformAdmin: user!.isPlatformAdmin,
  });

  redirect("/app");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

/** Lets any signed-in user (owner, manager, or worker) rename their own
 * account — the profile menu's "Edit profile" link. Does not touch email,
 * password, or role. */
export async function updateProfileAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    redirect("/app/profile?error=" + encodeURIComponent("Name can't be empty."));
  }

  await db.update(schema.users).set({ name }).where(eq(schema.users.id, session!.userId));
  revalidatePath("/app", "layout");
  redirect("/app/profile?saved=1");
}

/** Used by the team-accounts screen: an owner creates additional logins for
 * their own farm without going through the public signup flow. */
export async function createTeamMemberAction(formData: FormData) {
  const session = await readSession();
  if (!session || session.role !== "owner") redirect("/app");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = formData.get("role") === "manager" ? "manager" : "worker";

  if (!name || !email || password.length < 8) {
    redirect("/app/team?error=" + encodeURIComponent("Fill in every field — passwords need at least 8 characters."));
  }

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    redirect("/app/team?error=" + encodeURIComponent("That email is already in use."));
  }

  const passwordHash = await hashPassword(password);
  await db.insert(schema.users).values({
    farmId: session.farmId,
    name,
    email,
    passwordHash,
    role,
    isPlatformAdmin: false,
  });

  redirect("/app/team");
}

export async function removeTeamMemberAction(formData: FormData) {
  const session = await readSession();
  if (!session || session.role !== "owner") redirect("/app");
  const userId = String(formData.get("userId") || "");
  if (!userId || userId === session.userId) redirect("/app/team");

  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!target || target.farmId !== session.farmId) redirect("/app/team");

  await db.delete(schema.users).where(eq(schema.users.id, userId));
  redirect("/app/team");
}
