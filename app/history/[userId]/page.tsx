import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, attempts, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import Header from "@/components/Header";

export default async function HistoryPage({ params }: { params: Promise<{ userId: string }> }) {
  const me = await requireUser();
  const userId = Number((await params).userId);
  // Trainees see only their own history; admins see anyone's.
  if (me.role !== "admin" && userId !== me.id) notFound();
  const [person] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
  if (!person) notFound();

  const rows = await db
    .select({ a: attempts, title: tests.title, week: tests.week, maxAttempts: tests.maxAttempts, released: tests.answersReleasedAt })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .where(eq(attempts.userId, userId))
    .orderBy(asc(tests.liveAt), asc(tests.id), asc(attempts.submittedAt));

  type Group = { title: string; week: string; maxAttempts: number; released: boolean; tries: (typeof rows)[number]["a"][] };
  const groups = new Map<number, Group>();
  for (const r of rows) {
    const g = groups.get(r.a.testId) ?? { title: r.title, week: r.week, maxAttempts: r.maxAttempts, released: !!r.released, tries: [] };
    g.tries.push(r.a);
    groups.set(r.a.testId, g);
  }
  const bests = [...groups.values()].map((g) => Math.max(...g.tries.map((t) => t.pct)));
  const passedTests = [...groups.values()].filter((g) => g.tries.some((t) => t.passed)).length;
  const isSelf = userId === me.id;

  return (
    <>
      <Header user={me} active={isSelf ? `/history/${me.id}` : "/admin/users"} />
      <h2>{isSelf ? "My training history" : `Training history: ${person.name || person.email}`}</h2>
      {!isSelf && <p className="h2note">{person.email}</p>}
      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi"><b>{groups.size}</b><span>Tests taken</span></div>
        <div className="kpi"><b style={{ color: "var(--pass)" }}>{passedTests}</b><span>Tests passed</span></div>
        <div className="kpi"><b>{rows.length}</b><span>Total attempts</span></div>
        <div className="kpi"><b>{bests.length ? Math.round(bests.reduce((x, y) => x + y, 0) / bests.length) + "%" : "–"}</b><span>Average best score</span></div>
      </div>

      {groups.size === 0 && <p className="empty">No tests taken yet.</p>}
      {[...groups.entries()].map(([testId, g]) => (
        <section key={testId} className="block">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>{g.week ? `${g.week}: ` : ""}{g.title}</h3>
            <span className="small">{g.released || me.role === "admin" ? "Answers available" : "Answers not released yet"}</span>
          </div>
          <div className="scroll">
            <table style={{ minWidth: 560, marginTop: 8 }}>
              <thead><tr><th>Attempt</th><th className="c">Score</th><th className="c">Result</th><th>Submitted</th><th></th></tr></thead>
              <tbody>
                {g.tries.map((a, i) => (
                  <tr key={a.id}>
                    <td>{i + 1} of {g.maxAttempts}</td>
                    <td className="c">{a.score}/{a.total}</td>
                    <td className="c"><span className={`pill ${a.passed ? "pass" : "fail"}`}>{a.pct}%</span></td>
                    <td>{formatIST(a.submittedAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="btn ghost sm" href={`/attempts/${a.id}`}>
                        {g.released || me.role === "admin" ? "Review answers" : "View result"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
