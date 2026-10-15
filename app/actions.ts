"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, tests, questions, attempts } from "@/db/schema";
import {
  endSession, initialAdmins, isAllowedEmail, normalizeEmail, requireAdmin, requireUser, startSession,
} from "@/lib/auth";
import { parseISTLocal } from "@/lib/time";
import { scoreAttempt, testStatus } from "@/lib/tests";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ---------------- sign in ---------------- */

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = normalizeEmail(str(form, "email"));
  const password = String(form.get("password") ?? "");
  if (!isAllowedEmail(email)) return { error: "Only @spyne.ai email addresses can access this dashboard." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    const role = initialAdmins().has(email) ? "admin" : "trainee";
    [user] = await db.insert(users).values({ email, role }).returning();
  }

  if (!user.passwordHash) {
    // First sign-in: the password typed now becomes this person's password.
    const hash = await bcrypt.hash(password, 10);
    [user] = await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id)).returning();
  } else if (!(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Wrong password. Ask an admin to reset it if you've forgotten it." };
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await startSession(user);
  redirect(user.role === "admin" ? "/admin" : "/tests");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/* ---------------- users (admin) ---------------- */

export async function addUser(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const email = normalizeEmail(str(form, "email"));
  const name = str(form, "name") || null;
  const role = str(form, "role") === "admin" ? "admin" : "trainee";
  if (!isAllowedEmail(email)) return { error: "Only @spyne.ai email addresses can be added." };
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { error: `${email} already has access. Change their role in the table below.` };
  await db.insert(users).values({ email, name, role });
  revalidatePath("/admin/users");
  return { ok: `Added ${email} as ${role}. They set their own password the first time they sign in.` };
}

export async function setRole(userId: number, form: FormData) {
  const me = await requireAdmin();
  if (userId === me.id) return; // never demote yourself and lock the board out
  const role = str(form, "role") === "admin" ? "admin" : "trainee";
  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

export async function resetPassword(userId: number) {
  await requireAdmin();
  await db
    .update(users)
    .set({ passwordHash: null, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

export async function removeUser(userId: number) {
  const me = await requireAdmin();
  if (userId === me.id) return;
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

/* ---------------- tests (admin) ---------------- */

type QuestionInput = { topic: string; prompt: string; options: string[]; correctIndex: number; why: string; example: string };

function parseQuestions(raw: string): QuestionInput[] | string {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return "Couldn't read the questions. Reload and try again."; }
  if (!Array.isArray(data) || data.length === 0) return "Add at least one question.";
  const out: QuestionInput[] = [];
  for (const [i, q] of data.entries()) {
    const n = i + 1;
    const prompt = String(q?.prompt ?? "").trim();
    const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => String(o ?? "").trim()) : [];
    const correctIndex = Number(q?.correctIndex);
    if (!prompt) return `Question ${n} has no question text.`;
    if (options.length < 2 || options.some((o: string) => !o)) return `Question ${n} needs at least two options, none blank.`;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length)
      return `Question ${n} has no correct answer selected.`;
    out.push({
      prompt, options, correctIndex,
      topic: String(q?.topic ?? "").trim(),
      why: String(q?.why ?? "").trim(),
      example: String(q?.example ?? "").trim(),
    });
  }
  return out;
}

export async function saveTest(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const id = Number(form.get("id")) || null;
  const title = str(form, "title");
  const week = str(form, "week");
  const description = str(form, "description");
  const passPct = Number(form.get("passPct"));
  const maxAttempts = Number(form.get("maxAttempts"));
  const liveAt = parseISTLocal(str(form, "liveAt"));

  if (!title) return { error: "Give the test a title." };
  if (!liveAt) return { error: "Pick the date and time (IST) when the test goes live." };
  if (!Number.isInteger(passPct) || passPct < 1 || passPct > 100) return { error: "Pass mark must be between 1 and 100." };
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) return { error: "Attempts must be between 1 and 10." };

  const meta = { title, week, description, passPct, maxAttempts, liveAt };
  let locked = false;
  if (id) {
    const [{ n }] = await db.select({ n: count() }).from(attempts).where(eq(attempts.testId, id));
    locked = n > 0;
  }

  // Once anyone has attempted, questions are frozen so past scores and reviews stay true.
  let qs: QuestionInput[] = [];
  if (!locked) {
    const parsed = parseQuestions(String(form.get("questions") ?? ""));
    if (typeof parsed === "string") return { error: parsed };
    qs = parsed;
  }

  let testId = id;
  if (id) {
    await db.update(tests).set(meta).where(eq(tests.id, id));
  } else {
    const [row] = await db.insert(tests).values({ ...meta, createdBy: me.id }).returning({ id: tests.id });
    testId = row.id;
  }
  if (!locked) {
    await db.delete(questions).where(eq(questions.testId, testId!));
    await db.insert(questions).values(qs.map((q, position) => ({ ...q, position, testId: testId! })));
  }
  revalidatePath("/admin/tests");
  revalidatePath("/tests");
  redirect("/admin/tests");
}

export async function deleteTest(testId: number) {
  await requireAdmin();
  await db.delete(tests).where(eq(tests.id, testId));
  revalidatePath("/admin/tests");
  revalidatePath("/tests");
}

export async function setAnswersReleased(testId: number, release: boolean) {
  await requireAdmin();
  await db.update(tests).set({ answersReleasedAt: release ? new Date() : null }).where(eq(tests.id, testId));
  revalidatePath("/admin/tests");
  revalidatePath("/tests");
}

/* ---------------- attempts (trainee) ---------------- */

export async function submitAttempt(testId: number, startedAtIso: string, form: FormData) {
  const me = await requireUser();
  if (me.role !== "trainee") redirect("/admin");

  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test || testStatus(test) !== "live") redirect("/tests");

  const [{ n }] = await db
    .select({ n: count() })
    .from(attempts)
    .where(and(eq(attempts.testId, testId), eq(attempts.userId, me.id)));
  if (n >= test.maxAttempts) redirect("/tests");

  const qs = await db
    .select({ id: questions.id, correctIndex: questions.correctIndex })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));

  const answers: Record<string, number> = {};
  for (const q of qs) {
    const v = form.get(`q${q.id}`);
    if (v !== null && v !== "") answers[String(q.id)] = Number(v);
  }
  const result = scoreAttempt(qs, answers, test.passPct);
  const startedAt = new Date(startedAtIso);

  const [row] = await db
    .insert(attempts)
    .values({
      testId, userId: me.id, answers, ...result,
      startedAt: isNaN(startedAt.getTime()) ? null : startedAt,
    })
    .returning({ id: attempts.id });

  revalidatePath("/tests");
  redirect(`/attempts/${row.id}`);
}
