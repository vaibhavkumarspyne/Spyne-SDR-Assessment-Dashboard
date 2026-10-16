import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { LETTERS, isPending, shuffled, testStatus } from "@/lib/tests";
import { submitAttempt } from "@/app/actions";
import Header from "@/components/Header";
import DraftAnswer, { ClearDraftsOnSubmit } from "@/components/DraftAnswer";

export default async function TakeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (me.role !== "trainee") redirect("/admin/bank");
  const id = Number((await params).id);
  const [t] = await db.select().from(tests).where(eq(tests.id, id));
  if (!t) notFound();

  const status = testStatus(t);
  const mine = await db
    .select({ gradedAt: attempts.gradedAt })
    .from(attempts)
    .where(and(eq(attempts.testId, id), eq(attempts.userId, me.id)));
  const n = mine.length;

  let blocked: string | null = null;
  if (status === "scheduled") blocked = `This test opens at ${formatIST(t.liveAt)}.`;
  else if (status === "released") blocked = "This test is closed because its answers have been released.";
  else if (mine.some(isPending)) blocked = "Your last submission is waiting to be marked. You can retake the test once it's marked, if you have attempts left.";
  else if (n >= t.maxAttempts) blocked = "You've used all your attempts for this test.";

  if (blocked) {
    return (
      <>
        <Header user={me} active="/tests" />
        <p className="notice">{blocked}</p>
      </>
    );
  }

  // Never select correct_index, why or example here: trainees must not receive them.
  const qs = await db
    .select({ id: questions.id, prompt: questions.prompt, options: questions.options, maxMarks: questions.maxMarks })
    .from(questions)
    .where(eq(questions.testId, id))
    .orderBy(asc(questions.position));

  const written = t.kind === "written";
  const totalMarks = qs.reduce((sum, q) => sum + q.maxMarks, 0);
  const draftPrefix = `draft:${me.id}:${id}:`;
  const startedAt = new Date().toISOString();
  return (
    <>
      <Header user={me} active="/tests" />
      <form id="take-form" action={submitAttempt.bind(null, id, startedAt)}>
        <div className="quizbar">
          <h2>{t.title}</h2>
          <span className="small">
            Attempt {n + 1} of {t.maxAttempts} · {qs.length} questions · {written ? `${totalMarks} marks · ` : ""}pass mark {t.passPct}%
          </span>
        </div>
        {written && (
          <p className="notice">
            Your trainer marks this test by hand. Your answers are saved in this browser as you type, so a refresh won&apos;t lose them, but they
            aren&apos;t sent until you press Submit. Questions you leave blank score 0.
          </p>
        )}
        {qs.map((q, i) => (
          <div key={q.id} className="q">
            {written ? (
              <label style={{ display: "block" }}>
                <div style={{ fontWeight: 600, marginBottom: 10, display: "flex", gap: 10 }}>
                  <span className="qn">{i + 1}</span>
                  <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{q.prompt}</span>
                  <span className="small" style={{ flex: "none" }}>{q.maxMarks} marks</span>
                </div>
                <DraftAnswer name={`q${q.id}`} draftKey={`${draftPrefix}${q.id}`} />
              </label>
            ) : (
              <fieldset>
                <legend><span className="qn">{i + 1}</span><span>{q.prompt}</span></legend>
                {shuffled(q.options.map((text, idx) => ({ text, idx }))).map((o, k) => (
                  <label key={o.idx} className="opt">
                    <input type="radio" name={`q${q.id}`} value={o.idx} required />
                    <span className="letter">{LETTERS[k]}</span>
                    <span>{o.text}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        ))}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="small">
            {written ? "Check every answer before you submit. You can't change them afterwards." : "Answer every question to submit. You can't change answers after submitting."}
          </span>
          <button className="btn">Submit test</button>
        </div>
      </form>
      {written && <ClearDraftsOnSubmit prefix={draftPrefix} />}
    </>
  );
}
