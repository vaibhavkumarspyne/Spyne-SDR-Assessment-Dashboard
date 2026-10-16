import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { isPending } from "@/lib/tests";
import Header from "@/components/Header";
import MarkForm from "./MarkForm";

export default async function MarkAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = Number((await params).id);
  const [a] = await db.select().from(attempts).where(eq(attempts.id, id));
  if (!a) notFound();
  const [[t], [owner]] = await Promise.all([
    db.select().from(tests).where(eq(tests.id, a.testId)),
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, a.userId)),
  ]);
  if (!t || t.kind !== "written") notFound();
  const qs = await db.select().from(questions).where(eq(questions.testId, t.id)).orderBy(asc(questions.position));

  return (
    <>
      <Header user={me} active="/marking" />
      <div className="result">
        <p className="small" style={{ margin: 0 }}>{t.week ? `${t.week} · ` : ""}{t.title}</p>
        <h2 style={{ margin: "6px 0" }}>{owner?.name || owner?.email}</h2>
        <p className="small" style={{ margin: 0 }}>
          Submitted {formatIST(a.submittedAt)} · {qs.length} questions · {qs.reduce((s, q) => s + q.maxMarks, 0)} marks · pass mark {t.passPct}%
          {!isPending(a) && ` · currently ${a.score}/${a.total} (${a.pct}%), marked ${formatIST(a.gradedAt)}`}
        </p>
        <div className="row" style={{ marginTop: 14 }}><Link href="/marking" className="btn ghost sm">Back to marking</Link></div>
      </div>
      <MarkForm
        attemptId={a.id}
        questions={qs.map((q) => ({
          id: q.id, prompt: q.prompt, topic: q.topic, maxMarks: q.maxMarks, modelAnswer: q.why,
          answer: typeof a.answers[String(q.id)] === "string" ? String(a.answers[String(q.id)]) : "",
          mark: a.marks?.[String(q.id)], feedback: a.feedback?.[String(q.id)] ?? "",
        }))}
      />
    </>
  );
}
