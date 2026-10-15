// Creates tables (idempotent), promotes INITIAL_ADMIN_EMAILS, and seeds the original
// question bank the first time only. Run: npm run db:setup
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

type SeedTest = {
  key: string; week: string; title: string; description: string;
  questions: { topic: string; prompt: string; options: string[]; correctIndex: number; why: string; example: string }[];
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

    const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM tests`;
    if (n > 0) {
      console.log(`Found ${n} tests; skipping seed.`);
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
