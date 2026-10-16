"use client";

import { useActionState, useState } from "react";
import { importResults } from "@/app/actions";
import { resultsFromCsv, templateHeader, type DateOrder, type ImportQuestion, type ImportRow } from "@/lib/resultsCsv";
import { formatIST } from "@/lib/time";

export default function ImportResults({ testId, kind, questions, title }: { testId: number; kind: "mcq" | "written"; questions: ImportQuestion[]; title: string }) {
  const [state, action, pending] = useActionState(importResults.bind(null, testId), undefined);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [order, setOrder] = useState<DateOrder>("dmy");

  const { rows, errors } = text ? resultsFromCsv(text, { kind, questions }, order) : { rows: [] as ImportRow[], errors: [] as string[] };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after fixing it
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  function downloadTemplate() {
    const csv = templateHeader(kind, questions.length).join(",") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, "-").toLowerCase()}-results-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="block">
      <h2>Upload</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <button type="button" className="btn ghost sm" onClick={downloadTemplate}>Download template</button>
        <label className="btn ghost sm" style={{ cursor: "pointer" }}>
          Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
        </label>
        <label className="small row" style={{ gap: 6 }}>
          Dates like 03/04/2026 mean
          <select value={order} onChange={(e) => setOrder(e.target.value as DateOrder)} style={{ width: "auto" }}>
            <option value="dmy">3 April (DD/MM)</option>
            <option value="mdy">March 4 (MM/DD)</option>
          </select>
        </label>
      </div>

      {errors.length > 0 && (
        <div className="err" role="alert">
          <strong>{fileName} can&apos;t be imported yet. Fix these and choose the file again:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {errors.slice(0, 15).map((e) => <li key={e}>{e}</li>)}
            {errors.length > 15 && <li>…and {errors.length - 15} more.</li>}
          </ul>
        </div>
      )}

      {rows.length > 0 && errors.length === 0 && (
        <form action={action}>
          <input type="hidden" name="csv" value={text} />
          <input type="hidden" name="dateOrder" value={order} />
          <p className="ok" style={{ marginTop: 0 }}>{fileName}: {rows.length} result{rows.length === 1 ? "" : "s"} ready. Check them, then import.</p>
          <div className="scroll" style={{ maxHeight: 420, overflowY: "auto", marginBottom: 12 }}>
            <table style={{ minWidth: 560 }}>
              <thead><tr><th>Row</th><th>Email</th><th>Name</th><th>Submitted</th><th className="c">Score</th>{kind === "written" && <th className="c">Answers</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="small">{r.line}</td>
                    <td>{r.email}</td>
                    <td>{r.name || <span className="small">–</span>}</td>
                    <td>{r.submittedAt ? formatIST(new Date(r.submittedAt)) : <span className="small">Now</span>}</td>
                    <td className="c">{r.score}/{r.total} · {Math.round((r.score / r.total) * 100)}%</td>
                    {kind === "written" && <td className="c small">{Object.keys(r.answers).length} of {questions.length}{r.marks ? "" : " · total only"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" disabled={pending}>{pending ? "Importing…" : `Import ${rows.length} result${rows.length === 1 ? "" : "s"}`}</button>
        </form>
      )}
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">{state.ok}</p>}
    </section>
  );
}
