// Question CSV import. The format is the contract the agent prompt (lib/agentPrompt.ts) produces:
// question,option_a,option_b,option_c,option_d,option_e,option_f,correct,topic,why,example

export const CSV_COLUMNS = [
  "question", "option_a", "option_b", "option_c", "option_d", "option_e", "option_f",
  "correct", "topic", "why", "example",
] as const;

const OPTION_COLS = ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"] as const;
const MAX_ROWS = 200;

export type CsvQuestion = { topic: string; prompt: string; options: string[]; correctIndex: number; why: string; example: string };

/** RFC 4180: quoted fields, "" escapes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function questionsFromCsv(text: string): { questions: CsvQuestion[]; errors: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { questions: [], errors: ["The file needs a header row and at least one question row."] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof CSV_COLUMNS)[number], number>;
  const missing = ["question", "option_a", "option_b", "correct"].filter((c) => col[c as keyof typeof col] < 0);
  if (missing.length) return { questions: [], errors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template for the exact header.`] };
  if (rows.length - 1 > MAX_ROWS) return { questions: [], errors: [`Too many rows (${rows.length - 1}). The limit is ${MAX_ROWS} questions per test.`] };

  const errors: string[] = [];
  const questions: CsvQuestion[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2; // spreadsheet row number, header is row 1
    const get = (c: (typeof CSV_COLUMNS)[number]) => (col[c] >= 0 ? String(r[col[c]] ?? "").trim() : "");
    const prompt = get("question");
    const raw = OPTION_COLS.map((c) => get(c));
    const lastFilled = raw.reduce((acc, o, k) => (o ? k : acc), -1);
    const options = raw.slice(0, lastFilled + 1);
    const letter = get("correct").toUpperCase().replace(/[^A-F]/g, "");
    const correctIndex = letter.length === 1 ? letter.charCodeAt(0) - 65 : -1;

    if (!prompt) errors.push(`Row ${line}: question is empty.`);
    else if (options.length < 2) errors.push(`Row ${line}: needs at least option_a and option_b.`);
    else if (options.some((o) => !o)) errors.push(`Row ${line}: options have a gap; fill them left to right (A, B, C…).`);
    else if (correctIndex < 0) errors.push(`Row ${line}: correct must be one letter, A to F (got "${get("correct")}").`);
    else if (correctIndex >= options.length) errors.push(`Row ${line}: correct is ${letter} but option ${letter} is empty.`);
    else questions.push({ prompt, options, correctIndex, topic: get("topic"), why: get("why"), example: get("example") });
  });
  return { questions, errors };
}
