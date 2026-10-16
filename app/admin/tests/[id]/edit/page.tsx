import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { toISTLocal } from "@/lib/time";
import Header from "@/components/Header";
import TestEditor from "@/components/TestEditor";

export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const id = Number((await params).id);
  const [t] = await db.select().from(tests).where(eq(tests.id, id));
  if (!t) notFound();
  const qs = await db.select().from(questions).where(eq(questions.testId, id)).orderBy(asc(questions.position));
  const [{ n }] = await db.select({ n: count() }).from(attempts).where(eq(attempts.testId, id));

  return (
    <>
      <Header user={me} active="/admin/tests" />
      <h2 style={{ marginBottom: 14 }}>Edit: {t.title}</h2>
      <TestEditor
        test={{
          id: t.id, title: t.title, week: t.week, description: t.description, kind: t.kind,
          passPct: t.passPct, maxAttempts: t.maxAttempts, liveAt: toISTLocal(t.liveAt),
        }}
        initialQuestions={qs.map((q) => ({
          topic: q.topic, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, maxMarks: q.maxMarks, why: q.why, example: q.example,
        }))}
        locked={n > 0}
      />
    </>
  );
}
