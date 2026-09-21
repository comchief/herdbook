import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { readSession, type SessionPayload } from "./session";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Server Component / Server Action guard: redirects to /login when there is
 * no signed-in user. Use at the top of every authenticated page/action. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

/** Owner-only guard — team management and billing. */
export async function requireOwner(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "owner") redirect("/app");
  return session;
}

/** Manager-or-owner guard — everything a Worker account cannot do. */
export async function requireManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role === "worker") redirect("/app");
  return session;
}

/** Herdbook platform operator only (reviews payments across every farm). */
export async function requirePlatformAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!session.isPlatformAdmin) redirect("/app");
  return session;
}

export async function currentUserRecord(session: SessionPayload) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  return user ?? null;
}
