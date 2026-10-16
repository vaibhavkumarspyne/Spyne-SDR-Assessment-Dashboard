import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/db/schema";

const COOKIE = "sdr_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export const ALLOWED_DOMAIN = "spyne.ai";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return /^[^@\s]+@spyne\.ai$/.test(email);
}

export function initialAdmins(): Set<string> {
  return new Set(
    (process.env.INITIAL_ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean),
  );
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function startSession(user: User) {
  const token = await new SignJWT({ v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** Current user, re-read from the DB each request so role changes apply at once. */
export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const [user] = await db.select().from(users).where(eq(users.id, Number(payload.sub)));
    // Domain re-checked on every request, and a password reset bumps session_version.
    if (!user || !isAllowedEmail(user.email) || user.sessionVersion !== payload.v) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Where each role lands after sign-in. */
export function homeFor(user: Pick<User, "role">): string {
  return user.role === "admin" ? "/admin" : "/tests";
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect(homeFor(user));
  return user;
}
