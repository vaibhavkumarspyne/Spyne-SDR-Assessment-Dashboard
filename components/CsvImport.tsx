"use client";

import { useState } from "react";
import { questionsFromCsv, type CsvQuestion } from "@/lib/csv";
import { AGENT_PROMPT } from "@/lib/agentPrompt";

export default function CsvImport({ onImport }: { onImport: (qs: CsvQuestion[], mode: "replace" | "append") => void }) {
  const [parsed, setParsed] = useState<CsvQuestion[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after fixing it
    if (!file) return;
    setFileName(file.name);
    const { questions, errors } = questionsFromCsv(await file.text());
    setErrors(errors);
    setParsed(errors.length ? null : questions);
  }

  function apply(mode: "replace" | "append") {
    if (!parsed) return;
    onImport(parsed, mode);
    setParsed(null);
    setFileName("");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="qedit" style={{ background: "var(--panel-2)" }}>
      <strong>Import questions from CSV</strong>
      <p className="small" style={{ margin: "4px 0 10px" }}>
        Ask an AI agent for questions using the prompt below, save its output as a .csv file, and upload it here. Imported questions
        appear in the editor so you can check them before saving.
      </p>
      <div className="row">
        <label className="btn ghost sm" style={{ cursor: "pointer" }}>
          Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
        </label>
        <a className="btn ghost sm" href="/questions-template.csv" download>Download template</a>
        <button type="button" className="btn ghost sm" onClick={copyPrompt}>{copied ? "Copied" : "Copy agent prompt"}</button>
      </div>

      {errors.length > 0 && (
        <div className="err" role="alert">
          <strong>{fileName} wasn't imported. Fix these and upload again:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {errors.slice(0, 15).map((e) => <li key={e}>{e}</li>)}
            {errors.length > 15 && <li>…and {errors.length - 15} more.</li>}
          </ul>
        </div>
      )}
      {parsed && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="ok" style={{ margin: 0 }}>{fileName}: {parsed.length} question{parsed.length === 1 ? "" : "s"} ready.</span>
          <button type="button" className="btn sm" onClick={() => apply("replace")}>Replace current questions</button>
          <button type="button" className="btn ghost sm" onClick={() => apply("append")}>Add to the end</button>
        </div>
      )}

      <details style={{ marginTop: 10 }}>
        <summary className="small" style={{ cursor: "pointer" }}>Show the agent prompt</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 6, padding: 12, maxHeight: 320, overflow: "auto" }}>
          {AGENT_PROMPT}
        </pre>
      </details>
    </div>
  );
}
