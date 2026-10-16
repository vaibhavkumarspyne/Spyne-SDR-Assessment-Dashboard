import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { TEST_KIND_LABEL } from "@/lib/tests";
import Header from "@/components/Header";
import ImportResults from "./ImportResults";

export default async function ImportResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = Number((await params).id);
  const [t] = await db.select().from(tests).where(eq(tests.id, id));
  if (!t) notFound();
  const qs = await db
    .select({ id: questions.id, prompt: questions.prompt, maxMarks: questions.maxMarks })
    .from(questions)
    .where(eq(questions.testId, id))
    .orderBy(asc(questions.position));
  const written = t.kind === "written";

  return (
    <>
      <Header user={me} active="/admin/tests" />
      <h2>Import past results: {t.title}</h2>
      <p className="h2note">
        {TEST_KIND_LABEL[t.kind]} · {qs.length} questions{written ? ` · ${qs.reduce((s, q) => s + q.maxMarks, 0)} marks` : ""} · pass mark {t.passPct}%.{" "}
        <Link href="/admin/tests">Back to tests</Link>
      </p>

      <section className="block">
        <h2>Format</h2>
        <p className="h2note" style={{ marginBottom: 8 }}>One row per person per attempt. Download the template, paste your data into it, and upload it below.</p>
        <ul className="small" style={{ margin: "0 0 10px", paddingLeft: 18, display: "grid", gap: 4 }}>
          <li><strong>email</strong>: their @spyne.ai address. Anyone not on the board yet is added as a trainee.</li>
          <li><strong>name</strong>: optional. Fills in the name only for people who don&apos;t have one yet.</li>
          <li><strong>submitted_at</strong>: when they took it, in IST, e.g. <code>2026-10-14 13:45</code> or <code>14/10/2026 13:45:22</code> (Google Forms&apos; timestamp). Blank means now.</li>
          {written ? (
            <>
              <li><strong>q1_answer, q1_marks, q1_feedback</strong>, then the same for q2, q3 and on: their answer, the marks given and any feedback, in the question order below. Answers and feedback can be blank.</li>
              <li><strong>score</strong>: use this instead of the per-question marks when you only have a total out of {qs.reduce((s, q) => s + q.maxMarks, 0)}. Leave the q…_marks columns out of the file entirely in that case.</li>
            </>
          ) : (
            <>
              <li><strong>score</strong>: how many they got right.</li>
              <li><strong>total</strong>: optional, out of how many. Defaults to this test&apos;s {qs.length} questions.</li>
            </>
          )}
        </ul>
        <p className="small" style={{ margin: 0 }}>
          Imported results count as attempts: they show on the dashboard and in each trainee&apos;s history, and they lock this test&apos;s questions.
          Importing the same file again skips rows already imported.
        </p>
        {written && (
          <details style={{ marginTop: 10 }}>
            <summary className="small" style={{ cursor: "pointer" }}>Question order for the q1, q2… columns</summary>
            <ol className="small" style={{ paddingLeft: 22 }}>
              {qs.map((q) => <li key={q.id}>{q.prompt.length > 110 ? q.prompt.slice(0, 110) + "…" : q.prompt} ({q.maxMarks} marks)</li>)}
            </ol>
          </details>
        )}
      </section>

      <ImportResults testId={t.id} kind={t.kind} questions={qs.map((q) => ({ id: q.id, maxMarks: q.maxMarks }))} title={t.title} />
    </>
  );
}
