import type { Test, Question, User } from "@/db/schema";

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

export function scoreAttempt(qs: Pick<Question, "id" | "correctIndex">[], answers: Record<string, number>, passPct: number) {
  const score = qs.filter((q) => answers[String(q.id)] === q.correctIndex).length;
  const total = qs.length;
  const pct = total ? Math.round((score / total) * 100) : 0;
  return { score, total, pct, passed: pct >= passPct };
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
