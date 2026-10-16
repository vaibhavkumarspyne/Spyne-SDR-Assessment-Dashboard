"use client";

import { useActionState, useState } from "react";
import { gradeAttempt } from "@/app/actions";

type Q = { id: number; prompt: string; topic: string; maxMarks: number; modelAnswer: string; answer: string; mark?: number; feedback: string };

export default function MarkForm({ attemptId, questions }: { attemptId: number; questions: Q[] }) {
  const [state, action, pending] = useActionState(gradeAttempt.bind(null, attemptId), undefined);
  const [marks, setMarks] = useState<Record<number, string>>(
    Object.fromEntries(questions.map((q) => [q.id, q.mark == null ? "" : String(q.mark)])),
  );
  const total = questions.reduce((s, q) => s + q.maxMarks, 0);
  const awarded = questions.reduce((s, q) => s + (Number(marks[q.id]) || 0), 0);
  const filled = questions.filter((q) => marks[q.id] !== "").length;

  return (
    <form action={action}>
      {questions.map((q, i) => (
        <div key={q.id} className="q">
          <div style={{ fontWeight: 600, marginBottom: 10, display: "flex", gap: 10 }}>
            <span className="qn">{i + 1}</span>
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{q.prompt}</span>
            <span className="small" style={{ flex: "none" }}>{q.maxMarks} marks</span>
          </div>
          {q.topic && <p className="small" style={{ margin: "0 0 8px" }}>Topic: {q.topic}</p>}
          <div className="field" style={{ marginBottom: 10 }}>
            Trainee&apos;s answer
            {q.answer ? <div className="answer">{q.answer}</div> : <p className="err" style={{ margin: 0 }}>Left blank.</p>}
          </div>
          {q.modelAnswer && (
            <div className="explain" style={{ marginBottom: 10 }}>
              <div><strong>Model answer / marking guide: </strong><span style={{ whiteSpace: "pre-wrap" }}>{q.modelAnswer}</span></div>
            </div>
          )}
          <div className="grid-form" style={{ gridTemplateColumns: "minmax(120px,160px) minmax(0,1fr)" }}>
            <label className="field">
              Marks (0 to {q.maxMarks})
              <input type="number" name={`m${q.id}`} min={0} max={q.maxMarks} step={1} required
                value={marks[q.id]} onChange={(e) => setMarks((m) => ({ ...m, [q.id]: e.target.value }))} />
            </label>
            <label className="field">
              Feedback for the trainee
              <textarea name={`f${q.id}`} rows={2} defaultValue={q.feedback} placeholder="Optional. What was strong, what was missing." />
            </label>
          </div>
        </div>
      ))}
      <div className="quizbar" style={{ position: "sticky", bottom: 0, top: "auto", borderTop: "1px solid var(--line)", borderBottom: 0 }}>
        <span><strong>{awarded} of {total}</strong> <span className="small">({total ? Math.round((awarded / total) * 100) : 0}%) · {filled} of {questions.length} questions marked</span></span>
        <div className="row">
          {state?.error && <span className="err" role="alert" style={{ margin: 0 }}>{state.error}</span>}
          <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save marks"}</button>
        </div>
      </div>
    </form>
  );
}
