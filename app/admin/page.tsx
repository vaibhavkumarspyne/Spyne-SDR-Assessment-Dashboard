import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { isPending, testStatus } from "@/lib/tests";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  const me = await requireAdmin();
  const [allTests, trainees, allAttempts] = await Promise.all([
    db.select().from(tests).orderBy(asc(tests.liveAt), asc(tests.id)),
    db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.role, "trainee")).orderBy(asc(users.email)),
    db.select().from(attempts).orderBy(desc(attempts.submittedAt)),
  ]);
  const traineeIds = new Set(trainees.map((u) => u.id));
  const nameOf = new Map(trainees.map((u) => [u.id, u.name || u.email]));
  const tAttempts = allAttempts.filter((a) => traineeIds.has(a.userId));
  // Unmarked written attempts have placeholder scores, so every result below uses marked attempts only.
  const marked = tAttempts.filter((a) => !isPending(a));
  const waitingN = tAttempts.length - marked.length;

  // Cohort-wide numbers use each trainee's best score per test.
  const best = new Map<string, number>();
  for (const a of marked) {
    const k = `${a.userId}:${a.testId}`;
    best.set(k, Math.max(best.get(k) ?? 0, a.pct));
  }
  const bestVals = [...best.values()];

  // Selected test: from ?test=, else the most recent one that's gone live.
  const now = new Date();
  const wanted = Number((await searchParams).test);
  const selected =
    allTests.find((t) => t.id === wanted) ??
    [...allTests].reverse().find((t) => t.liveAt <= now) ??
    allTests[0];

  let ranking: { userId: number; best: number; passed: boolean; tries: number; last: Date }[] = [];
  let accuracy: { prompt: string; pct: number; n: number }[] = [];
  let notAttempted: typeof trainees = [];
  let selectedWaiting = 0;
  if (selected) {
    const submitted = new Set(tAttempts.filter((a) => a.testId === selected.id).map((a) => a.userId));
    const sa = marked.filter((a) => a.testId === selected.id);
    selectedWaiting = tAttempts.filter((a) => a.testId === selected.id && isPending(a)).length;
    const per = new Map<number, typeof sa>();
    for (const a of sa) per.set(a.userId, [...(per.get(a.userId) ?? []), a]);
    ranking = [...per.entries()]
      .map(([userId, list]) => ({
        userId,
        best: Math.max(...list.map((a) => a.pct)),
        passed: list.some((a) => a.passed),
        tries: list.length,
        last: list[0].submittedAt,
      }))
      .sort((x, y) => y.best - x.best || x.last.getTime() - y.last.getTime());
    notAttempted = trainees.filter((u) => !submitted.has(u.id));

    // Question accuracy from each trainee's latest attempt, hardest first.
    // Results imported as a score only carry no per-question answers or marks, so they can't inform question accuracy.
    const latest = [...per.values()]
      .map((list) => list[0])
      .filter((a) => (selected.kind === "written" ? !!a.marks : Object.keys(a.answers).length > 0));
    const qs = await db.select().from(questions).where(eq(questions.testId, selected.id)).orderBy(asc(questions.position));
    if (latest.length) {
      accuracy = qs
        .map((q) => {
          // Written: share of the available marks the cohort earned on this question.
          const right =
            selected.kind === "written"
              ? latest.reduce((sum, a) => sum + (a.marks?.[String(q.id)] ?? 0), 0) / q.maxMarks
              : latest.filter((a) => a.answers[String(q.id)] === q.correctIndex).length;
          return { prompt: q.prompt, pct: Math.round((right / latest.length) * 100), n: latest.length };
        })
        .sort((x, y) => x.pct - y.pct);
    }
  }
  const passN = ranking.filter((r) => r.passed).length;

  return (
    <>
      <Header user={me} active="/admin" />
      <div className="kpis">
        <div className="kpi"><b>{trainees.length}</b><span>Trainees</span></div>
        <div className="kpi"><b>{allTests.filter((t) => testStatus(t) === "live").length}</b><span>Tests live now</span></div>
        <div className="kpi"><b>{tAttempts.length}</b><span>Attempts submitted</span></div>
        {waitingN > 0 && <Link href="/marking" className="kpi" style={{ textDecoration: "none" }}><b style={{ color: "var(--wait)" }}>{waitingN}</b><span>Waiting to be marked</span></Link>}
        <div className="kpi"><b>{bestVals.length ? Math.round(bestVals.reduce((a, b) => a + b, 0) / bestVals.length) + "%" : "–"}</b><span>Cohort average (best scores)</span></div>
      </div>

      {selected ? (
        <section className="block">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row"><h2 style={{ margin: 0 }}>{selected.title}</h2><StatusBadge status={testStatus(selected)} /></div>
            <form className="row">
              <select name="test" defaultValue={selected.id} aria-label="Choose test" style={{ width: "auto" }}>
                {allTests.map((t) => <option key={t.id} value={t.id}>{t.week ? `${t.week}: ` : ""}{t.title}</option>)}
              </select>
              <button className="btn ghost sm">Show</button>
            </form>
          </div>
          <p className="h2note" style={{ marginTop: 6 }}>
            Live {formatIST(selected.liveAt)} · pass mark {selected.passPct}% ·{" "}
            {selected.answersReleasedAt ? `answers released ${formatIST(selected.answersReleasedAt)}` : "answers not released"}
          </p>
          <div className="kpis">
            <div className="kpi"><b>{ranking.length}</b><span>Attempted</span></div>
            <div className="kpi"><b style={{ color: "var(--pass)" }}>{passN}</b><span>Passed</span></div>
            <div className="kpi"><b style={{ color: "var(--fail)" }}>{ranking.length - passN}</b><span>Below pass mark</span></div>
            {selectedWaiting > 0 && <div className="kpi"><b style={{ color: "var(--wait)" }}>{selectedWaiting}</b><span>Waiting to be marked</span></div>}
            <div className="kpi"><b>{notAttempted.length}</b><span>Not attempted</span></div>
            <div className="kpi"><b>{ranking.length ? Math.round(ranking.reduce((a, r) => a + r.best, 0) / ranking.length) + "%" : "–"}</b><span>Average best score</span></div>
          </div>

          <h3 style={{ margin: "8px 0" }}>Ranking</h3>
          <div className="scroll">
            <table style={{ minWidth: 640 }}>
              <thead><tr><th className="c">Rank</th><th>Trainee</th><th className="c">Best</th><th className="c">Attempts</th><th>Last submitted</th><th></th></tr></thead>
              <tbody>
                {ranking.length === 0 && <tr><td colSpan={6} className="empty">No attempts yet.</td></tr>}
                {ranking.map((r, i) => (
                  <tr key={r.userId}>
                    <td className="c">{i + 1}</td>
                    <td><strong>{nameOf.get(r.userId)}</strong></td>
                    <td className="c"><span className={`pill ${r.passed ? "pass" : "fail"}`}>{r.best}%</span></td>
                    <td className="c">{r.tries} of {selected.maxAttempts}</td>
                    <td>{formatIST(r.last)}</td>
                    <td style={{ textAlign: "right" }}><Link className="btn ghost sm" href={`/history/${r.userId}`}>History</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notAttempted.length > 0 && (
            <p className="small" style={{ marginTop: 10 }}>Not attempted: {notAttempted.map((u) => u.name || u.email).join(", ")}</p>
          )}

          {accuracy.length > 0 && (
            <>
              <h3 style={{ margin: "18px 0 4px" }}>Question accuracy</h3>
              <p className="h2note">
                {selected.kind === "written"
                  ? "Share of available marks earned on each question across trainees' latest marked attempts, hardest first. Use it to plan coaching."
                  : "Share of trainees whose latest attempt got it right, hardest first. Use it to plan coaching."}
              </p>
              <div className="scroll">
                <table style={{ minWidth: 560 }}>
                  <tbody>
                    {accuracy.map((q, i) => (
                      <tr key={i}>
                        <td>{q.prompt}</td>
                        <td className="c" style={{ width: 90 }}><span className={`pill ${q.pct >= selected.passPct ? "pass" : "fail"}`}>{q.pct}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : (
        <p className="empty">No tests yet. <Link href="/admin/tests/new">Create the first one.</Link></p>
      )}

      <section className="block">
        <h2>Latest submissions</h2>
        {tAttempts.length === 0 && <p className="empty">No submissions yet.</p>}
        <div className="scroll">
          <table style={{ minWidth: 560 }}>
            <tbody>
              {tAttempts.slice(0, 10).map((a) => (
                <tr key={a.id}>
                  <td><strong>{nameOf.get(a.userId)}</strong></td>
                  <td>{allTests.find((t) => t.id === a.testId)?.title}</td>
                  <td className="c">
                    {isPending(a) ? <span className="pill wait">Awaiting marking</span> : <span className={`pill ${a.passed ? "pass" : "fail"}`}>{a.pct}%</span>}
                  </td>
                  <td>{formatIST(a.submittedAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn ghost sm" href={isPending(a) ? `/marking/${a.id}` : `/attempts/${a.id}`}>{isPending(a) ? "Mark" : "Open"}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
