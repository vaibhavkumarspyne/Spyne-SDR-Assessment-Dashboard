// Creates tables (idempotent), promotes INITIAL_ADMIN_EMAILS, and seeds the original
// question bank the first time only. Run: npm run db:setup
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

type SeedTest = {
  key: string; week: string; title: string; description: string;
  questions: { topic: string; prompt: string; options: string[]; correctIndex: number; why: string; example: string }[];
};
type SeedWritten = {
  key: string; week: string; title: string; description: string; passPct: number; maxAttempts: number;
  questions: { topic: string; prompt: string; maxMarks: number; why: string }[];
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. On Vercel: project > Storage > connect a Neon database, then Redeploy.");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  try {
    await sql.unsafe(fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"));
    console.log("Schema ready.");

    const admins = (process.env.INITIAL_ADMIN_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@spyne\.ai$/.test(e));
    for (const email of admins) {
      await sql`INSERT INTO users (email, role) VALUES (${email}, 'admin')
                ON CONFLICT (email) DO UPDATE SET role = 'admin'`;
    }
    if (admins.length) console.log(`Admins: ${admins.join(", ")}`);

    // The Week 2 written assignment arrived after launch, so it's seeded on its own: once, the first time
    // the database has no written test. Deleting it afterwards is respected as long as another written test exists.
    const [{ w }] = await sql<{ w: number }[]>`SELECT count(*)::int AS w FROM tests WHERE kind = 'written'`;
    if (w === 0) {
      const written: SeedWritten[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed-written.json"), "utf8"));
      for (const t of written) {
        const [{ id }] = await sql<{ id: number }[]>`
          INSERT INTO tests (title, week, description, kind, pass_pct, max_attempts, live_at)
          VALUES (${t.title}, ${t.week}, ${t.description}, 'written', ${t.passPct}, ${t.maxAttempts}, now()) RETURNING id`;
        for (const [position, q] of t.questions.entries()) {
          await sql`
            INSERT INTO questions (test_id, position, topic, prompt, options, correct_index, max_marks, why)
            VALUES (${id}, ${position}, ${q.topic}, ${q.prompt}, ${sql.json([])}, -1, ${q.maxMarks}, ${q.why})`;
        }
        console.log(`Seeded written test "${t.title}" (${t.questions.length} questions).`);
      }
    }

    const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM tests WHERE kind = 'mcq'`;
    if (n > 0) {
      console.log(`Found ${n} multiple-choice tests; skipping seed.`);
      return;
    }

    const seed: SeedTest[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed-tests.json"), "utf8"));
    // Seeded tests go live immediately; reschedule them from the Tests tab if needed.
    for (const t of seed) {
      const [{ id }] = await sql<{ id: number }[]>`
        INSERT INTO tests (title, week, description, live_at)
        VALUES (${t.title}, ${t.week}, ${t.description}, now()) RETURNING id`;
      for (const [position, q] of t.questions.entries()) {
        await sql`
          INSERT INTO questions (test_id, position, topic, prompt, options, correct_index, why, example)
          VALUES (${id}, ${position}, ${q.topic}, ${q.prompt}, ${sql.json(q.options)}, ${q.correctIndex}, ${q.why}, ${q.example})`;
      }
      console.log(`Seeded "${t.title}" (${t.questions.length} questions).`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
