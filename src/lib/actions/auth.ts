"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { setSessionCookie, clearSessionCookie, readSession } from "@/lib/session";
import { TRIAL_DAYS } from "@/lib/subscription";
import { revalidatePath } from "next/cache";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a profile photo, small enough to store inline

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

/** Profile photo upload — stored inline as a data: URL rather than pushed
 * to an object store, so it works without any file-hosting setup. Capped
 * at MAX_AVATAR_BYTES to keep rows (and pages that render the avatar)
 * small. */
export async function updateAvatarAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/app/profile?error=" + encodeURIComponent("Choose an image to upload."));
  }
  if (!file!.type.startsWith("image/")) {
    redirect("/app/profile?error=" + encodeURIComponent("That file isn't an image."));
  }
  if (file!.size > MAX_AVATAR_BYTES) {
    redirect("/app/profile?error=" + encodeURIComponent("Photo is too large — please use one under 2MB."));
  }

  const buffer = Buffer.from(await file!.arrayBuffer());
  const dataUrl = `data:${file!.type};base64,${buffer.toString("base64")}`;

  await db.update(schema.users).set({ avatarUrl: dataUrl }).where(eq(schema.users.id, session!.userId));
  revalidatePath("/app", "layout");
  redirect("/app/profile?photoSaved=1");
}

export async function removeAvatarAction() {
  const session = await readSession();
  if (!session) redirect("/login");

  await db.update(schema.users).set({ avatarUrl: null }).where(eq(schema.users.id, session!.userId));
  revalidatePath("/app", "layout");
  redirect("/app/profile?photoRemoved=1");
}

/** Self-service password change — requires the current password rather
 * than trusting the active session alone, same as any account-security
 * flow. */
export async function changePasswordAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session!.userId)).limit(1);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    redirect("/app/profile?error=" + encodeURIComponent("Current password is incorrect.") + "#password");
  }
  if (newPassword.length < 8) {
    redirect("/app/profile?error=" + encodeURIComponent("New password needs at least 8 characters.") + "#password");
  }
  if (newPassword !== confirmPassword) {
    redirect("/app/profile?error=" + encodeURIComponent("New passwords don't match.") + "#password");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, session!.userId));
  redirect("/app/profile?passwordChanged=1#password");
}

/** Records a deletion request rather than deleting anything outright — for
 * a Farm Owner this account is the whole tenant, so an instant, unreviewed
 * delete would take every pig, sale, and teammate's login with it. The
 * request is timestamped for manual follow-up and can be withdrawn with
 * cancelAccountDeletionAction below. */
export async function requestAccountDeletionAction(formData: FormData) {
  const session = await readSession();
  if (!session) redirect("/login");

  if (formData.get("confirm") !== "on") {
    redirect("/app/profile?error=" + encodeURIComponent("Please confirm before requesting deletion.") + "#delete");
  }

  await db.update(schema.users).set({ deletionRequestedAt: new Date() }).where(eq(schema.users.id, session!.userId));
  redirect("/app/profile?deletionRequested=1#delete");
}

export async function cancelAccountDeletionAction() {
  const session = await readSession();
  if (!session) redirect("/login");

  await db.update(schema.users).set({ deletionRequestedAt: null }).where(eq(schema.users.id, session!.userId));
  redirect("/app/profile?deletionCanceled=1#delete");
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
