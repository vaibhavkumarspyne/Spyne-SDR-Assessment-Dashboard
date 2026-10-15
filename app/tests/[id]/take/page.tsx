import { notFound, redirect } from "next/navigation";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { LETTERS, shuffled, testStatus } from "@/lib/tests";
import { submitAttempt } from "@/app/actions";
import Header from "@/components/Header";

export default async function TakeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (me.role !== "trainee") redirect("/admin/bank");
  const id = Number((await params).id);
  const [t] = await db.select().from(tests).where(eq(tests.id, id));
  if (!t) notFound();

  const status = testStatus(t);
  const [{ n }] = await db
    .select({ n: count() })
    .from(attempts)
    .where(and(eq(attempts.testId, id), eq(attempts.userId, me.id)));

  let blocked: string | null = null;
  if (status === "scheduled") blocked = `This test opens at ${formatIST(t.liveAt)}.`;
  else if (status === "released") blocked = "This test is closed because its answers have been released.";
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
    .select({ id: questions.id, prompt: questions.prompt, options: questions.options })
    .from(questions)
    .where(eq(questions.testId, id))
    .orderBy(asc(questions.position));

  const startedAt = new Date().toISOString();
  return (
    <>
      <Header user={me} active="/tests" />
      <form action={submitAttempt.bind(null, id, startedAt)}>
        <div className="quizbar">
          <h2>{t.title}</h2>
          <span className="small">Attempt {n + 1} of {t.maxAttempts} · {qs.length} questions · pass mark {t.passPct}%</span>
        </div>
        {qs.map((q, i) => (
          <div key={q.id} className="q">
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
          </div>
        ))}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="small">Answer every question to submit. You can't change answers after submitting.</span>
          <button className="btn">Submit test</button>
        </div>
      </form>
    </>
  );
}
