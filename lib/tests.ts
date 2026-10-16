import type { Attempt, Test, Question, User } from "@/db/schema";

export type TestStatus = "scheduled" | "live" | "released";

/** scheduled: before live_at. live: open for attempts. released: answers out, attempts closed. */
export function testStatus(t: Test, now = new Date()): TestStatus {
  if (t.answersReleasedAt) return "released";
  return t.liveAt.getTime() <= now.getTime() ? "live" : "scheduled";
}

/**
 * The one rule for who sees correct answers, explanations and examples:
 * admins always; a trainee only after the admin releases that test AND they have attempted it.
 */
export function canSeeAnswers(user: User, test: Test, hasAttempted: boolean): boolean {
  if (user.role === "admin") return true;
  return !!test.answersReleasedAt && hasAttempted;
}

function result(score: number, total: number, passPct: number) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  return { score, total, pct, passed: pct >= passPct };
}

export function scoreAttempt(qs: Pick<Question, "id" | "correctIndex">[], answers: Record<string, number | string>, passPct: number) {
  return result(qs.filter((q) => answers[String(q.id)] === q.correctIndex).length, qs.length, passPct);
}

/** Written tests: score is marks awarded out of the sum of each question's max marks. */
export function scoreMarks(qs: Pick<Question, "id" | "maxMarks">[], marks: Record<string, number>, passPct: number) {
  const score = qs.reduce((sum, q) => sum + (marks[String(q.id)] ?? 0), 0);
  return result(score, qs.reduce((sum, q) => sum + q.maxMarks, 0), passPct);
}

/** A written attempt nobody has marked yet. Its score, pct and passed are placeholders, so leave it out of results. */
export function isPending(a: Pick<Attempt, "gradedAt">): boolean {
  return !a.gradedAt;
}

export function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

export const TEST_KIND_LABEL = { mcq: "Multiple choice", written: "Written" } as const;
