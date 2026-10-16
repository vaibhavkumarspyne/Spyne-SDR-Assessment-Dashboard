"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, tests, questions, attempts } from "@/db/schema";
import {
  endSession, homeFor, initialAdmins, isAllowedEmail, normalizeEmail, requireAdmin, requireUser, startSession,
} from "@/lib/auth";
import { parseISTLocal } from "@/lib/time";
import { resultsFromCsv } from "@/lib/resultsCsv";
import { isPending, scoreAttempt, scoreMarks, testStatus } from "@/lib/tests";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const MAX_ANSWER_CHARS = 20_000;

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
  redirect(homeFor(user));
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

type QuestionInput = { topic: string; prompt: string; options: string[]; correctIndex: number; maxMarks: number; why: string; example: string };
type TestKind = "mcq" | "written";

function parseQuestions(raw: string, kind: TestKind): QuestionInput[] | string {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return "Couldn't read the questions. Reload and try again."; }
  if (!Array.isArray(data) || data.length === 0) return "Add at least one question.";
  const out: QuestionInput[] = [];
  for (const [i, q] of data.entries()) {
    const n = i + 1;
    const prompt = String(q?.prompt ?? "").trim();
    if (kind === "written") {
      // why holds the model answer / marking guide the admin marks against.
      const maxMarks = Number(q?.maxMarks);
      if (!prompt) return `Question ${n} has no question text.`;
      if (!Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 100) return `Question ${n} needs marks between 1 and 100.`;
      out.push({ prompt, options: [], correctIndex: -1, maxMarks, topic: String(q?.topic ?? "").trim(), why: String(q?.why ?? "").trim(), example: "" });
      continue;
    }
    const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => String(o ?? "").trim()) : [];
    const correctIndex = Number(q?.correctIndex);
    if (!prompt) return `Question ${n} has no question text.`;
    if (options.length < 2 || options.some((o: string) => !o)) return `Question ${n} needs at least two options, none blank.`;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length)
      return `Question ${n} has no correct answer selected.`;
    out.push({
      prompt, options, correctIndex, maxMarks: 1,
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

  let kind: TestKind = str(form, "kind") === "written" ? "written" : "mcq";
  let locked = false;
  if (id) {
    const [{ n }] = await db.select({ n: count() }).from(attempts).where(eq(attempts.testId, id));
    locked = n > 0;
    // The type is part of the questions, so it freezes with them.
    if (locked) {
      const [existing] = await db.select({ kind: tests.kind }).from(tests).where(eq(tests.id, id));
      if (existing) kind = existing.kind;
    }
  }
  const meta = { title, week, description, kind, passPct, maxAttempts, liveAt };

  // Once anyone has attempted, questions are frozen so past scores and reviews stay true.
  let qs: QuestionInput[] = [];
  if (!locked) {
    const parsed = parseQuestions(String(form.get("questions") ?? ""), kind);
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

  const mine = await db
    .select({ gradedAt: attempts.gradedAt })
    .from(attempts)
    .where(and(eq(attempts.testId, testId), eq(attempts.userId, me.id)));
  // No retake while the last written attempt is still waiting to be marked.
  if (mine.length >= test.maxAttempts || mine.some(isPending)) redirect("/tests");

  const qs = await db
    .select({ id: questions.id, correctIndex: questions.correctIndex, maxMarks: questions.maxMarks })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));

  const answers: Record<string, number | string> = {};
  for (const q of qs) {
    const v = form.get(`q${q.id}`);
    if (v === null || v === "") continue;
    if (test.kind === "written") {
      const text = String(v).trim().slice(0, MAX_ANSWER_CHARS);
      if (text) answers[String(q.id)] = text;
    } else answers[String(q.id)] = Number(v);
  }
  // Written attempts are stored unmarked (0 out of the full marks) until an admin marks them.
  const written = test.kind === "written";
  const result = written ? { ...scoreMarks(qs, {}, test.passPct), passed: false } : scoreAttempt(qs, answers, test.passPct);
  const startedAt = new Date(startedAtIso);

  const [row] = await db
    .insert(attempts)
    .values({
      testId, userId: me.id, answers, ...result,
      startedAt: isNaN(startedAt.getTime()) ? null : startedAt,
      gradedAt: written ? null : new Date(),
    })
    .returning({ id: attempts.id });

  revalidatePath("/tests");
  redirect(`/attempts/${row.id}`);
}

/* ---------------- marking written tests (admin) ---------------- */

export async function gradeAttempt(attemptId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const [a] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!a) return { error: "That submission no longer exists." };
  const [test] = await db.select().from(tests).where(eq(tests.id, a.testId));
  if (!test || test.kind !== "written") return { error: "Only written tests are marked by hand." };

  const qs = await db
    .select({ id: questions.id, maxMarks: questions.maxMarks })
    .from(questions)
    .where(eq(questions.testId, test.id))
    .orderBy(asc(questions.position));

  const marks: Record<string, number> = {};
  const feedback: Record<string, string> = {};
  for (const [i, q] of qs.entries()) {
    const raw = str(form, `m${q.id}`);
    const m = Number(raw);
    if (raw === "" || !Number.isInteger(m) || m < 0 || m > q.maxMarks)
      return { error: `Question ${i + 1} needs a whole number of marks from 0 to ${q.maxMarks}.` };
    marks[String(q.id)] = m;
    const note = str(form, `f${q.id}`).slice(0, MAX_ANSWER_CHARS);
    if (note) feedback[String(q.id)] = note;
  }

  await db
    .update(attempts)
    .set({ ...scoreMarks(qs, marks, test.passPct), marks, feedback, gradedAt: new Date(), gradedBy: me.id })
    .where(eq(attempts.id, attemptId));
  revalidatePath("/marking");
  revalidatePath("/admin");
  revalidatePath("/tests");
  redirect("/marking");
}

/* ---------------- past results import (admin) ---------------- */

export async function importResults(testId: number, _prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) return { error: "That test no longer exists." };
  const qs = await db
    .select({ id: questions.id, maxMarks: questions.maxMarks })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));

  // The browser already previewed the file; parse it again here so nothing unchecked reaches the database.
  const order = str(form, "dateOrder") === "mdy" ? "mdy" : "dmy";
  const { rows, errors } = resultsFromCsv(String(form.get("csv") ?? ""), { kind: test.kind, questions: qs }, order);
  if (errors.length) return { error: `Nothing was imported. ${errors.slice(0, 5).join(" ")}${errors.length > 5 ? ` …and ${errors.length - 5} more.` : ""}` };
  if (!rows.length) return { error: "The file has no result rows." };

  let added = 0, skipped = 0, newPeople = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      let [user] = await tx.select().from(users).where(eq(users.email, r.email));
      if (!user) {
        [user] = await tx.insert(users).values({ email: r.email, name: r.name || null, role: "trainee" }).returning();
        newPeople++;
      } else if (!user.name && r.name) {
        await tx.update(users).set({ name: r.name }).where(eq(users.id, user.id));
      }
      const submittedAt = r.submittedAt ? new Date(r.submittedAt) : new Date();
      // Re-importing the same file is safe: an attempt with the same person, test and time is skipped.
      if (r.submittedAt) {
        const [dupe] = await tx
          .select({ id: attempts.id })
          .from(attempts)
          .where(and(eq(attempts.testId, testId), eq(attempts.userId, user.id), eq(attempts.submittedAt, submittedAt)));
        if (dupe) { skipped++; continue; }
      }
      const pct = Math.round((r.score / r.total) * 100);
      await tx.insert(attempts).values({
        testId, userId: user.id, answers: r.answers, score: r.score, total: r.total, pct, passed: pct >= test.passPct,
        marks: r.marks, feedback: test.kind === "written" ? r.feedback : null,
        submittedAt, gradedAt: submittedAt, gradedBy: me.id,
      });
      added++;
    }
  });
  revalidatePath("/admin");
  revalidatePath("/admin/tests");
  revalidatePath("/marking");
  return {
    ok: `Imported ${added} result${added === 1 ? "" : "s"}` +
      (skipped ? `, skipped ${skipped} already imported` : "") +
      (newPeople ? `, added ${newPeople} new trainee${newPeople === 1 ? "" : "s"}` : "") + ".",
  };
}
