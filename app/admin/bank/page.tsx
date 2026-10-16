import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, type Question } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { LETTERS, testStatus } from "@/lib/tests";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";

export default async function BankPage() {
  const me = await requireAdmin();
  const [ts, qs] = await Promise.all([
    db.select().from(tests).orderBy(asc(tests.liveAt), asc(tests.id)),
    db.select().from(questions).orderBy(asc(questions.testId), asc(questions.position)),
  ]);
  const byTest = new Map<number, Question[]>();
  for (const q of qs) byTest.set(q.testId, [...(byTest.get(q.testId) ?? []), q]);

  return (
    <>
      <Header user={me} active="/admin/bank" />
      <p className="h2note" style={{ fontSize: 15 }}>
        Every question with its correct answer, explanation and worked example. Visible to admins only.
      </p>
      {ts.map((t) => {
        const list = byTest.get(t.id) ?? [];
        return (
          <details key={t.id} className="block" style={{ padding: 0 }}>
            <summary style={{ padding: 18, cursor: "pointer" }}>
              <span className="row" style={{ display: "inline-flex" }}>
                <strong>{t.week ? `${t.week}: ` : ""}{t.title}</strong>
                <StatusBadge status={testStatus(t)} />
                <span className="small">
                  {t.kind === "written" ? `Written · ${list.reduce((s, q) => s + q.maxMarks, 0)} marks · ` : ""}{list.length} questions · live {formatIST(t.liveAt)}
                </span>
              </span>
            </summary>
            <div style={{ padding: "0 18px 18px" }}>
              <p><Link className="btn ghost sm" href={`/admin/tests/${t.id}/edit`}>Edit test</Link></p>
              {list.map((q, i) => (
                <div key={q.id} className="q">
                  <div style={{ fontWeight: 600, marginBottom: 10, display: "flex", gap: 10 }}>
                    <span className="qn">{i + 1}</span><span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{q.prompt}</span>
                    {t.kind === "written" && <span className="small" style={{ flex: "none" }}>{q.maxMarks} marks</span>}
                  </div>
                  {t.kind === "written" ? (
                    <div className="explain">
                      <div><strong>Model answer / marking guide: </strong><span style={{ whiteSpace: "pre-wrap" }}>{q.why || "None given."}</span></div>
                      {q.topic && <div className="small">Topic: {q.topic}</div>}
                    </div>
                  ) : (<>
                  {q.options.map((o, k) => (
                    <div key={k} className={`opt ${k === q.correctIndex ? "right" : ""}`}>
                      <span className="letter">{LETTERS[k]}</span><span>{o}</span>
                      {k === q.correctIndex && <span className="opt-tag">Correct</span>}
                    </div>
                  ))}
                  <div className="explain">
                    {q.why && <div><strong>Why: </strong>{q.why}</div>}
                    {q.example && <div><strong>Example: </strong>{q.example}</div>}
                    {q.topic && <div className="small">Topic: {q.topic}</div>}
                  </div>
                  </>)}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </>
  );
}
