"use client";

import { useActionState, useState } from "react";
import { saveTest } from "@/app/actions";
import CsvImport from "@/components/CsvImport";

export type EditorQuestion = { topic: string; prompt: string; options: string[]; correctIndex: number; maxMarks: number; why: string; example: string };
export type EditorTest = {
  id?: number; title: string; week: string; description: string; kind: "mcq" | "written";
  passPct: number; maxAttempts: number; liveAt: string; // IST "YYYY-MM-DDTHH:mm"
};

const blankQuestion = (): EditorQuestion => ({ topic: "", prompt: "", options: ["", "", "", ""], correctIndex: -1, maxMarks: 10, why: "", example: "" });

export default function TestEditor({ test, initialQuestions, locked }: { test: EditorTest; initialQuestions: EditorQuestion[]; locked: boolean }) {
  const [state, action, pending] = useActionState(saveTest, undefined);
  const [kind, setKind] = useState(test.kind);
  const [qs, setQs] = useState<EditorQuestion[]>(initialQuestions.length ? initialQuestions : [blankQuestion()]);
  const written = kind === "written";

  const update = (i: number, patch: Partial<EditorQuestion>) => setQs((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) =>
    setQs((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const totalMarks = qs.reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0);

  return (
    <form action={action}>
      {test.id && <input type="hidden" name="id" value={test.id} />}
      <input type="hidden" name="questions" value={JSON.stringify(qs)} />
      <input type="hidden" name="kind" value={kind} />

      <section className="block">
        <h2>Details and schedule</h2>
        <div className="grid-form">
          <label className="field">Title<input type="text" name="title" required defaultValue={test.title} /></label>
          <label className="field">Week label<input type="text" name="week" defaultValue={test.week} placeholder="Week 1" /></label>
          <label className="field">
            Test type
            <select value={kind} onChange={(e) => setKind(e.target.value as EditorTest["kind"])} disabled={locked}>
              <option value="mcq">Multiple choice (scored automatically)</option>
              <option value="written">Written (marked by an admin)</option>
            </select>
          </label>
          <label className="field">
            Goes live at (IST)
            <input type="datetime-local" name="liveAt" required defaultValue={test.liveAt} />
            <small>Trainees can't open the test before this time, India Standard Time.</small>
          </label>
          <label className="field">Pass mark (%)<input type="number" name="passPct" min={1} max={100} required defaultValue={test.passPct} /></label>
          <label className="field">Attempts allowed<input type="number" name="maxAttempts" min={1} max={10} required defaultValue={test.maxAttempts} /></label>
        </div>
        <label className="field">Description<textarea name="description" rows={2} defaultValue={test.description} /></label>
      </section>

      <section className="block">
        <h2>Questions{written && <span className="small" style={{ fontFamily: "var(--font-sans)", marginLeft: 8 }}>{totalMarks} marks in total</span>}</h2>
        {locked ? (
          <p className="notice">Trainees have already attempted this test, so its questions are locked to keep their scores and reviews accurate. You can still change the details and schedule. To change questions, create a new test.</p>
        ) : written ? (
          <p className="h2note">Trainees type an answer to each question. The model answer is what the admin marks against. Trainees see it only after you release answers.</p>
        ) : (
          <>
            <p className="h2note">Select the radio button next to the correct option. Options are shuffled for each trainee. The explanation and example are shown only to admins, and to trainees after you release answers.</p>
            <CsvImport
              onImport={(incoming, mode) =>
                setQs((prev) => {
                  // A lone untouched blank question shouldn't survive an "add to the end".
                  const kept = prev.filter((q) => q.prompt.trim() || q.options.some((o) => o.trim()));
                  const full = incoming.map((q) => ({ ...q, maxMarks: 1 }));
                  return mode === "replace" ? full : [...kept, ...full];
                })
              }
            />
          </>
        )}
        {qs.map((q, i) => (
          <fieldset key={i} className="qedit" disabled={locked}>
            <div className="qedit-head">
              <strong>Question {i + 1}</strong>
              {!locked && (
                <div className="row">
                  <button type="button" className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="btn danger sm" onClick={() => setQs((p) => p.filter((_, j) => j !== i))} disabled={qs.length === 1}>Remove</button>
                </div>
              )}
            </div>
            <label className="field">Question<textarea rows={written ? 3 : 2} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} /></label>
            <div className="grid-form">
              <label className="field">Topic<input type="text" value={q.topic} onChange={(e) => update(i, { topic: e.target.value })} placeholder={written ? "e.g. Bob Sight Ford: Email drafting" : "e.g. Personas"} /></label>
              {written && (
                <label className="field">Marks<input type="number" min={1} max={100} value={q.maxMarks} onChange={(e) => update(i, { maxMarks: Number(e.target.value) })} /></label>
              )}
            </div>
            {written ? (
              <label className="field">
                Model answer / marking guide
                <textarea rows={4} value={q.why} onChange={(e) => update(i, { why: e.target.value })} placeholder="What a strong answer covers. Whoever marks it marks against this." />
              </label>
            ) : (
              <>
                <div className="field">
                  Options (select the correct one)
                  {q.options.map((o, k) => (
                    <div key={k} className="optedit">
                      <input type="radio" name={`correct-${i}`} checked={q.correctIndex === k} onChange={() => update(i, { correctIndex: k })} aria-label={`Option ${k + 1} is correct`} />
                      <input type="text" value={o} onChange={(e) => update(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} placeholder={`Option ${k + 1}`} />
                      {!locked && q.options.length > 2 && (
                        <button type="button" className="btn ghost sm" aria-label={`Remove option ${k + 1}`}
                          onClick={() => update(i, {
                            options: q.options.filter((_, m) => m !== k),
                            correctIndex: q.correctIndex === k ? -1 : q.correctIndex > k ? q.correctIndex - 1 : q.correctIndex,
                          })}>×</button>
                      )}
                    </div>
                  ))}
                  {!locked && q.options.length < 6 && (
                    <div><button type="button" className="btn ghost sm" onClick={() => update(i, { options: [...q.options, ""] })}>Add option</button></div>
                  )}
                </div>
                <label className="field">Why this is correct<textarea rows={2} value={q.why} onChange={(e) => update(i, { why: e.target.value })} /></label>
                <label className="field">Worked example<textarea rows={2} value={q.example} onChange={(e) => update(i, { example: e.target.value })} /></label>
              </>
            )}
          </fieldset>
        ))}
        {!locked && <button type="button" className="btn ghost" onClick={() => setQs((p) => [...p, blankQuestion()])}>Add question</button>}
      </section>

      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save test"}</button>
    </form>
  );
}
