import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, attempts, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { isPending } from "@/lib/tests";
import Header from "@/components/Header";

export default async function MarkingPage() {
  const me = await requireAdmin();
  const rows = await db
    .select({ a: attempts, title: tests.title, week: tests.week, name: users.name, email: users.email })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(eq(tests.kind, "written"))
    .orderBy(asc(attempts.submittedAt));

  const waiting = rows.filter((r) => isPending(r.a));
  const marked = rows.filter((r) => !isPending(r.a)).sort((x, y) => y.a.gradedAt!.getTime() - x.a.gradedAt!.getTime());
  const markerIds = [...new Set(marked.map((r) => r.a.gradedBy).filter((x): x is number => x != null))];
  const markers = markerIds.length
    ? new Map((await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, markerIds))).map((u) => [u.id, u.name || u.email]))
    : new Map<number, string>();

  return (
    <>
      <Header user={me} active="/marking" />
      <div className="kpis">
        <div className="kpi"><b style={{ color: waiting.length ? "var(--wait)" : undefined }}>{waiting.length}</b><span>Waiting to be marked</span></div>
        <div className="kpi"><b>{marked.length}</b><span>Marked</span></div>
      </div>

      <section className="block">
        <h2>Waiting to be marked</h2>
        <p className="h2note">Oldest first. Trainees see their score as soon as you save marks, and the model answers once an admin releases them.</p>
        {waiting.length === 0 && <p className="empty">Nothing to mark right now.</p>}
        <div className="scroll">
          <table style={{ minWidth: 560 }}>
            <tbody>
              {waiting.map((r) => (
                <tr key={r.a.id}>
                  <td><strong>{r.name || r.email}</strong></td>
                  <td>{r.week ? `${r.week}: ` : ""}{r.title}</td>
                  <td>Submitted {formatIST(r.a.submittedAt)}</td>
                  <td style={{ textAlign: "right" }}><Link className="btn sm" href={`/marking/${r.a.id}`}>Mark</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>Marked</h2>
        {marked.length === 0 && <p className="empty">No written tests marked yet.</p>}
        <div className="scroll">
          <table style={{ minWidth: 640 }}>
            <tbody>
              {marked.map((r) => (
                <tr key={r.a.id}>
                  <td><strong>{r.name || r.email}</strong></td>
                  <td>{r.week ? `${r.week}: ` : ""}{r.title}</td>
                  <td className="c"><span className={`pill ${r.a.passed ? "pass" : "fail"}`}>{r.a.score}/{r.a.total} · {r.a.pct}%</span></td>
                  <td className="small">Marked {formatIST(r.a.gradedAt)}{r.a.gradedBy != null && markers.get(r.a.gradedBy) ? ` by ${markers.get(r.a.gradedBy)}` : ""}</td>
                  <td style={{ textAlign: "right" }}><Link className="btn ghost sm" href={`/marking/${r.a.id}`}>Change marks</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
