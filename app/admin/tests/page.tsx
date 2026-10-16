import Link from "next/link";
import { asc, countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests, questions, attempts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { TEST_KIND_LABEL, testStatus } from "@/lib/tests";
import { deleteTest, setAnswersReleased } from "@/app/actions";
import Header from "@/components/Header";
import ConfirmButton from "@/components/ConfirmButton";
import StatusBadge from "@/components/StatusBadge";

export default async function AdminTestsPage() {
  const me = await requireAdmin();
  const rows = await db
    .select({
      test: tests,
      qCount: countDistinct(questions.id),
      takers: countDistinct(attempts.userId),
    })
    .from(tests)
    .leftJoin(questions, eq(questions.testId, tests.id))
    .leftJoin(attempts, eq(attempts.testId, tests.id))
    .groupBy(tests.id)
    .orderBy(asc(tests.liveAt), asc(tests.id));

  return (
    <>
      <Header user={me} active="/admin/tests" />
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h2>Tests</h2>
          <p className="h2note" style={{ margin: 0 }}>
            Trainees can open a test only after its go-live time (IST). Answers stay hidden from trainees until you release them.
          </p>
        </div>
        <Link href="/admin/tests/new" className="btn">New test</Link>
      </div>

      {rows.length === 0 && <p className="empty">No tests yet. Create the first one.</p>}
      <div className="modlist">
        {rows.map(({ test: t, qCount, takers }) => {
          const status = testStatus(t);
          return (
            <div key={t.id} className="mod">
              <div className="wk">{t.week || "—"}</div>
              <div>
                <div className="row"><h3>{t.title}</h3><StatusBadge status={status} /></div>
                <p>
                  {TEST_KIND_LABEL[t.kind]} · {qCount} questions · pass {t.passPct}% · {t.maxAttempts} attempt{t.maxAttempts === 1 ? "" : "s"} ·{" "}
                  {status === "scheduled" ? "goes live " : "went live "} {formatIST(t.liveAt)}
                </p>
                <p>
                  {takers} trainee{takers === 1 ? "" : "s"} attempted
                  {t.answersReleasedAt && ` · answers released ${formatIST(t.answersReleasedAt)}`}
                </p>
              </div>
              <div className="right">
                {t.answersReleasedAt ? (
                  <ConfirmButton
                    action={setAnswersReleased.bind(null, t.id, false)}
                    message={`Hide the answers for "${t.title}" again? Trainees will stop seeing them, and the test reopens for attempts.`}
                    className="btn ghost sm"
                  >
                    Hide answers
                  </ConfirmButton>
                ) : (
                  <ConfirmButton
                    action={setAnswersReleased.bind(null, t.id, true)}
                    message={`Release the answers for "${t.title}"? Every trainee who has attempted it will see the correct answers and explanations, and no new attempts will be accepted.`}
                    className="btn sm"
                  >
                    Release answers
                  </ConfirmButton>
                )}
                <div className="row">
                  <Link className="btn ghost sm" href={`/admin/tests/${t.id}/edit`}>Edit</Link>
                  <Link className="btn ghost sm" href={`/admin?test=${t.id}`}>Results</Link>
                  <Link className="btn ghost sm" href={`/admin/tests/${t.id}/import`}>Import results</Link>
                  <ConfirmButton
                    action={deleteTest.bind(null, t.id)}
                    message={`Delete "${t.title}" and all of its attempts? This can't be undone.`}
                    className="btn danger sm"
                  >
                    Delete
                  </ConfirmButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
