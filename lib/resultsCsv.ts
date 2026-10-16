// Past-results CSV import, one row per person per attempt. Shared by the import page (preview) and
// app/actions.ts importResults (which re-checks everything). The columns depend on the test:
//   mcq:     email,name,submitted_at,score[,total]
//   written: email,name,submitted_at,q1_answer,q1_marks,q1_feedback,q2_answer,…[,score]
import { parseCsv } from "@/lib/csv";

export type DateOrder = "dmy" | "mdy";
export type ImportQuestion = { id: number; maxMarks: number };
export type ImportRow = {
  line: number; email: string; name: string; submittedAt: string | null; // ISO, or null = now
  score: number; total: number;
  answers: Record<string, string>; marks: Record<string, number> | null; feedback: Record<string, string>;
};

const MAX_ROWS = 500;

export function templateHeader(kind: "mcq" | "written", questionCount: number): string[] {
  const base = ["email", "name", "submitted_at"];
  if (kind === "mcq") return [...base, "score", "total"];
  const perQ = Array.from({ length: questionCount }, (_, i) => [`q${i + 1}_answer`, `q${i + 1}_marks`, `q${i + 1}_feedback`]).flat();
  return [...base, ...perQ, "score"];
}

/**
 * Dates are read as IST. Accepts 2026-10-14, 2026-10-14 13:45, 14/10/2026 13:45:22 (or 10/14/2026 with mdy),
 * and AM/PM times, which covers what Google Forms and Sheets export.
 */
export function parseIstDate(raw: string, order: DateOrder): Date | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  let y: number, mo: number, d: number, rest: string;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.*))?$/);
  if (m) [y, mo, d, rest] = [+m[1], +m[2], +m[3], m[4] ?? ""];
  else if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,]+(.*))?$/))) {
    [d, mo] = order === "dmy" ? [+m[1], +m[2]] : [+m[2], +m[1]];
    [y, rest] = [+m[3], m[4] ?? ""];
  } else return "invalid";

  let hh = 0, mm = 0, ss = 0;
  if (rest.trim()) {
    const t = rest.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
    if (!t) return "invalid";
    [hh, mm, ss] = [+t[1], +t[2], +(t[3] ?? 0)];
    if (t[4]) {
      if (hh < 1 || hh > 12) return "invalid";
      hh = (hh % 12) + (/p/i.test(t[4]) ? 12 : 0);
    }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return "invalid";
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}+05:30`);
  if (isNaN(date.getTime())) return "invalid";
  // Rejects 31/02 and similar, which Date would otherwise roll into the next month.
  const ist = new Date(date.getTime() + 330 * 60_000);
  return ist.getUTCMonth() + 1 === mo && ist.getUTCDate() === d ? date : "invalid";
}

const whole = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN);

export function resultsFromCsv(
  text: string,
  test: { kind: "mcq" | "written"; questions: ImportQuestion[] },
  order: DateOrder,
): { rows: ImportRow[]; errors: string[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], errors: ["The file needs a header row and at least one result row."] };
  if (all.length - 1 > MAX_ROWS) return { rows: [], errors: [`Too many rows (${all.length - 1}). Import at most ${MAX_ROWS} at a time.`] };

  const header = all[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  if (at("email") < 0) return { rows: [], errors: ["Missing the email column. Download the template for the exact header."] };
  const qCols = test.questions.map((_, i) => ({ answer: at(`q${i + 1}_answer`), marks: at(`q${i + 1}_marks`), feedback: at(`q${i + 1}_feedback`) }));
  const hasPerQuestionMarks = qCols.some((c) => c.marks >= 0);
  if (test.kind === "mcq" && at("score") < 0) return { rows: [], errors: ["Missing the score column."] };
  if (test.kind === "written" && !hasPerQuestionMarks && at("score") < 0)
    return { rows: [], errors: ["Add marks: either the q1_marks, q2_marks… columns or a single score column."] };

  const fullMarks = test.questions.reduce((s, q) => s + q.maxMarks, 0);
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (c: number) => (c >= 0 ? String(r[c] ?? "").trim() : "");
    const email = get(at("email")).toLowerCase();
    const when = parseIstDate(get(at("submitted_at")), order);
    if (!/^[^@\s]+@spyne\.ai$/.test(email)) return void errors.push(`Row ${line}: "${email || "(blank)"}" isn't a @spyne.ai email.`);
    if (when === "invalid") return void errors.push(`Row ${line}: can't read the date "${get(at("submitted_at"))}". Use 2026-10-14 13:45 or 14/10/2026 13:45.`);

    const base = { line, email, name: get(at("name")), submittedAt: when ? when.toISOString() : null };
    if (test.kind === "mcq") {
      const total = get(at("total")) ? whole(get(at("total"))) : test.questions.length;
      const score = whole(get(at("score")));
      if (!Number.isInteger(total) || total < 1) return void errors.push(`Row ${line}: total must be a whole number above 0.`);
      if (!Number.isInteger(score) || score > total) return void errors.push(`Row ${line}: score must be a whole number from 0 to ${total}.`);
      return void rows.push({ ...base, score, total, answers: {}, marks: null, feedback: {} });
    }

    const answers: Record<string, string> = {};
    const feedback: Record<string, string> = {};
    let marks: Record<string, number> | null = null;
    for (const [k, q] of test.questions.entries()) {
      const c = qCols[k];
      if (get(c.answer)) answers[String(q.id)] = get(c.answer);
      if (get(c.feedback)) feedback[String(q.id)] = get(c.feedback);
    }
    if (hasPerQuestionMarks) {
      marks = {};
      for (const [k, q] of test.questions.entries()) {
        const m = whole(get(qCols[k].marks));
        if (!Number.isInteger(m) || m > q.maxMarks) return void errors.push(`Row ${line}: q${k + 1}_marks must be a whole number from 0 to ${q.maxMarks}.`);
        marks[String(q.id)] = m;
      }
    }
    const score = marks ? Object.values(marks).reduce((s, m) => s + m, 0) : whole(get(at("score")));
    if (!Number.isInteger(score) || score > fullMarks) return void errors.push(`Row ${line}: score must be a whole number from 0 to ${fullMarks}.`);
    rows.push({ ...base, score, total: fullMarks, answers, marks, feedback });
  });
  return { rows, errors };
}
