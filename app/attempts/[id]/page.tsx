import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { LETTERS, canSeeAnswers, isPending } from "@/lib/tests";
import Header from "@/components/Header";

const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return (s >= 60 ? `${Math.floor(s / 60)}m ` : "") + `${s % 60}s`;
};

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const [a] = await db.select().from(attempts).where(eq(attempts.id, id));
  // A trainee can open only their own attempts; admins can open anyone's.
  if (!a || (me.role !== "admin" && a.userId !== me.id)) notFound();
  const pending = isPending(a);

  const [[t], [owner]] = await Promise.all([
    db.select().from(tests).where(eq(tests.id, a.testId)),
    db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, a.userId)),
  ]);
  const attemptNo = (
    await db.select({ id: attempts.id }).from(attempts)
      .where(and(eq(attempts.testId, a.testId), eq(attempts.userId, a.userId), lte(attempts.submittedAt, a.submittedAt)))
  ).length;

  const written = t.kind === "written";
  const showAnswers = canSeeAnswers(me, t, true);
  const qs = showAnswers
    ? await db.select().from(questions).where(eq(questions.testId, t.id)).orderBy(asc(questions.position))
    : [];
  const backHref = me.role === "admin" ? `/history/${a.userId}` : "/tests";

  return (
    <>
      <Header user={me} active={me.role === "admin" ? "/admin" : "/tests"} />
      <div className="result">
        <p className="small" style={{ margin: 0 }}>
          {t.week ? `${t.week} · ` : ""}{t.title} · attempt {attemptNo} of {t.maxAttempts}
          {me.role === "admin" && ` · ${owner?.name || owner?.email}`}
        </p>
        {pending ? (
          <>
            <div className="score" style={{ color: "var(--wait)", fontSize: "clamp(40px,7vw,64px)" }}>Awaiting marking</div>
            <p style={{ fontWeight: 600, margin: "8px 0 4px" }}>Your trainer will mark this out of {a.total}. The score appears here once they do.</p>
          </>
        ) : (
          <>
            <div className={`score ${a.passed ? "pass" : "fail"}`}>{a.pct}%</div>
            <p style={{ fontWeight: 600, margin: "8px 0 4px" }}>
              {a.score} of {a.total} {written ? "marks" : "correct"} · {a.passed ? "Passed" : `Below the ${t.passPct}% pass mark`}
            </p>
          </>
        )}
        <p className="small" style={{ margin: 0 }}>
          Submitted {formatIST(a.submittedAt)}
          {a.startedAt && ` · took ${fmtDur(a.submittedAt.getTime() - a.startedAt.getTime())}`}
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <Link href={backHref} className="btn ghost sm">Back</Link>
          {written && me.role === "admin" && <Link href={`/marking/${a.id}`} className="btn ghost sm">{pending ? "Mark" : "Change marks"}</Link>}
          {me.role !== "admin" && <Link href={`/history/${me.id}`} className="btn ghost sm">My history</Link>}
        </div>
      </div>

      {!showAnswers && (
        <p className="notice">
          {written
            ? "Your trainer hasn't released the answers for this test yet. Once they do, each question will appear here with your answer, your marks and feedback, and the model answer."
            : "Your trainer hasn't released the answers for this test yet. Once they do, every question with the correct answer, the reason and a worked example will appear here."}
        </p>
      )}

      {showAnswers && written && (
        <>
          <h2 style={{ margin: "8px 0 12px" }}>Answer review</h2>
          {qs.map((q, i) => {
            const answer = a.answers[String(q.id)];
            const mark = a.marks?.[String(q.id)];
            const note = a.feedback?.[String(q.id)];
            return (
              <div key={q.id} className={`q ${pending || mark == null ? "" : mark === q.maxMarks ? "q-ok" : "q-no"}`}>
                <div style={{ fontWeight: 600, marginBottom: 10, display: "flex", gap: 10 }}>
                  <span className="qn">{i + 1}</span>
                  <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{q.prompt}</span>
                  <span className="small" style={{ flex: "none" }}>{pending || mark == null ? `${q.maxMarks} marks` : `${mark} of ${q.maxMarks}`}</span>
                </div>
                {typeof answer === "string" && answer ? <div className="answer">{answer}</div> : <p className="err">Not answered.</p>}
                {(note || q.why) && (
                  <div className="explain">
                    {note && <div><strong>Trainer&apos;s feedback: </strong><span style={{ whiteSpace: "pre-wrap" }}>{note}</span></div>}
                    {q.why && <div><strong>Model answer: </strong><span style={{ whiteSpace: "pre-wrap" }}>{q.why}</span></div>}
                    {q.topic && <div className="small">Topic: {q.topic}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {showAnswers && !written && (
        <>
          <h2 style={{ margin: "8px 0 12px" }}>Answer review</h2>
          {qs.map((q, i) => {
            const chosen = a.answers[String(q.id)];
            const ok = chosen === q.correctIndex;
            return (
              <div key={q.id} className={`q ${ok ? "q-ok" : "q-no"}`}>
                <div style={{ fontWeight: 600, marginBottom: 10, display: "flex", gap: 10 }}>
                  <span className="qn">{i + 1}</span><span>{q.prompt}</span>
                </div>
                {q.options.map((o, k) => {
                  const cls = k === q.correctIndex ? "right" : k === chosen ? "wrong" : "";
                  const tag = k === q.correctIndex ? (k === chosen ? "Your answer, correct" : "Correct answer") : k === chosen ? "Your answer" : "";
                  return (
                    <div key={k} className={`opt ${cls}`}>
                      <span className="letter">{LETTERS[k]}</span><span>{o}</span>
                      {tag && <span className="opt-tag">{tag}</span>}
                    </div>
                  );
                })}
                {chosen === undefined && <p className="err">Not answered.</p>}
                {(q.why || q.example) && (
                  <div className="explain">
                    {q.why && <div><strong>Why: </strong>{q.why}</div>}
                    {q.example && <div><strong>Example: </strong>{q.example}</div>}
                    {q.topic && <div className="small">Topic: {q.topic}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
