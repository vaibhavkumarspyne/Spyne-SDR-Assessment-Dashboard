import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, countDistinct, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts, type Attempt } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { isPending, testStatus } from "@/lib/tests";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

export default async function TraineeTestsPage() {
  const me = await requireUser();
  if (me.role === "admin") redirect("/admin/tests");

  const [rows, mine] = await Promise.all([
    db
      .select({ test: tests, qCount: countDistinct(questions.id) })
      .from(tests)
      .leftJoin(questions, eq(questions.testId, tests.id))
      .groupBy(tests.id)
      .orderBy(asc(tests.liveAt), asc(tests.id)),
    db.select().from(attempts).where(eq(attempts.userId, me.id)).orderBy(desc(attempts.submittedAt)),
  ]);
  const byTest = new Map<number, Attempt[]>();
  for (const a of mine) byTest.set(a.testId, [...(byTest.get(a.testId) ?? []), a]);

  return (
    <>
      <Header user={me} active="/tests" />
      <p className="h2note" style={{ fontSize: 15 }}>
        Each test opens at the time shown (IST). Questions appear only while you're taking a test. After you submit you'll see your score,
        and you can review every answer once your trainer releases them.
      </p>
      {rows.length === 0 && <p className="empty">No tests have been scheduled yet.</p>}
      <div className="modlist">
        {rows.map(({ test: t, qCount }) => {
          const status = testStatus(t);
          const tries = byTest.get(t.id) ?? [];
          const latest = tries[0];
          const marked = tries.filter((a) => !isPending(a));
          const waiting = tries.some(isPending);
          const best = marked.length ? Math.max(...marked.map((a) => a.pct)) : null;
          const passed = marked.some((a) => a.passed);
          const left = Math.max(0, t.maxAttempts - tries.length);

          let action: React.ReactNode = null;
          let meta = "";
          if (status === "scheduled") {
            meta = `Opens ${formatIST(t.liveAt)}`;
          } else if (status === "live") {
            meta = waiting
              ? "Submitted. Waiting for your trainer to mark it."
              : tries.length
              ? `${tries.length} of ${t.maxAttempts} attempts used. Answers will show once your trainer releases them.`
              : `${t.kind === "written" ? "Written, marked by your trainer · " : ""}${t.maxAttempts} attempt${t.maxAttempts === 1 ? "" : "s"} · pass mark ${t.passPct}%`;
            action = (
              <>
                {left > 0 && !passed && !waiting && (
                  <Link className="btn" href={`/tests/${t.id}/take`}>{tries.length ? "Retake test" : "Start test"}</Link>
                )}
                {latest && <Link className="btn ghost sm" href={`/attempts/${latest.id}`}>View result</Link>}
              </>
            );
          } else {
            meta = tries.length ? "Answers released. Review what you got right and wrong." : "Closed. You didn't attempt this test.";
            action = latest ? <Link className="btn" href={`/attempts/${latest.id}`}>Review answers</Link> : null;
          }

          return (
            <div key={t.id} className={`mod${status === "scheduled" ? " muted" : ""}`}>
              <div className="wk">{t.week || "—"}</div>
              <div>
                <div className="row"><h3>{t.title}</h3><StatusBadge status={status} /></div>
                {t.description && <p>{t.description}</p>}
                <p>{qCount} questions · {meta}</p>
              </div>
              <div className="right">
                {waiting && best == null && <span className="pill wait">Awaiting marking</span>}
                {best != null && <span className={`pill ${passed ? "pass" : "fail"}`}>Best {best}%</span>}
                {action}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
