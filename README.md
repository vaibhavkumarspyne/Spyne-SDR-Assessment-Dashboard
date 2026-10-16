# SDR Certification Board

Spyne SDR training: scheduled multiple-choice tests, results, training history and answer release.
Next.js 15 (App Router) + Postgres (Neon) + Drizzle. Hosted on Vercel.

## How access works

| | Admin | Trainee |
|---|---|---|
| Sign in | Any `@spyne.ai` email. First sign-in sets the password. | Same |
| Correct answers, explanations, examples | Always (Test bank tab) | Only after attempting a test **and** an admin clicks **Release answers** for it |
| Questions | Always | Only while taking a live test |
| Training history | Everyone's | Their own |
| Add people, set roles, reset passwords | Yes (Users tab) | No |
| Create, edit, schedule tests | Yes. Go-live time is entered in IST | No |

Rules worth knowing:

- Anyone with a `@spyne.ai` email can sign in. If no admin added them first, they get the trainee role.
- A test can't be opened before its go-live time (IST). Releasing answers closes the test to new attempts. **Hide answers** reverses both.
- Once anyone has attempted a test, its questions are locked so past scores stay accurate. The details and schedule can still change.
- Trainees get the test's attempt limit (default 2), and can't retake a test they've passed.
- Options are shuffled for each trainee, and correct answers are never sent to the browser while a test is being taken.
- Every role and access check runs on the server, in `lib/auth.ts`, `lib/tests.ts` and `app/actions.ts`.

## Creating questions with an AI agent

On **Tests → New test** (or Edit), the *Import questions from CSV* box has:

- **Copy agent prompt**: paste it into any AI agent, fill in the topic and source material and the number of questions, and the agent returns a CSV.
- **Download template**: the exact format, with two example rows.
- **Choose CSV file**: upload the agent's CSV. Questions load into the editor to review, then **Save test**.

CSV header, exactly: `question,option_a,option_b,option_c,option_d,option_e,option_f,correct,topic,why,example`

`correct` is a letter A–F. Options `e` and `f` are optional. `topic`, `why` and `example` are optional but recommended. If any row is wrong, nothing is imported and each problem is listed by row number. The prompt lives in `lib/agentPrompt.ts`, the parser in `lib/csv.ts`; change them together.

## Written tests

Pick **Test type → Written** in the test editor. Each question has marks and a model answer (marking guide). Trainees type an answer per question; drafts are kept in their browser until they submit.

- Submissions land on the **Marking** tab (admins only). Open one, give whole-number marks per question and optional feedback, and save. Marks can be changed later.
- Until it's marked, an attempt shows as *Awaiting marking*: it's left out of scores, rankings and averages, and the trainee can't retake the test.
- Once marked, the trainee sees their score. After **Release answers**, they also see each answer with its marks, feedback and the model answer.
- The Week 2 assignment (*Dealership outreach strategy*: 4 dealerships × research, email, cold-call pitch, 10 marks each, 120 total) is seeded on the next deploy as a written test.

## Importing past results

**Tests → Import results** on any test. Download that test's template, fill it in and upload it. The rows are previewed before anything is saved.

- Multiple choice: `email,name,submitted_at,score[,total]`
- Written: `email,name,submitted_at,q1_answer,q1_marks,q1_feedback,…` (one set per question, in the test's question order), or just `score` when only a total is known.
- `submitted_at` is read as IST and accepts Google Forms timestamps; choose DD/MM or MM/DD on the page.
- New emails are added as trainees. Re-importing the same file skips rows already imported (same person, test and time).

## Deploy (first time)

1. **GitHub**: put this folder in a new private repo (without `node_modules`, `.next`, `.pglite` or `.env.local`).
2. **Vercel**: Add New → Project → import the repo. Framework preset: Next.js. Add these Environment Variables:
   - `SESSION_SECRET`: output of `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `INITIAL_ADMIN_EMAILS`: comma-separated admin emails, e.g. `mrigang.shukla@spyne.ai`
3. **Database**: in the Vercel project, go to Storage → Create Database → Neon (region Mumbai, `bom1`), and connect it to all environments. This adds `DATABASE_URL` automatically. Then Deployments → ⋯ → Redeploy. The first deploy fails until the database is connected, and that's expected.
4. Open the Vercel URL, sign in with an admin email and choose a password.

Every Vercel deploy runs `vercel-build`, which runs `scripts/setup.ts` before `next build`. That creates any missing tables, makes sure `INITIAL_ADMIN_EMAILS` are admins, and on the very first deploy seeds the original 7 modules (61 questions), all live immediately. Re-running it is safe: the seed is skipped once any test exists.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in SESSION_SECRET; DATABASE_URL + DB_POOL_MAX=1 for local PGlite
npm run db:local             # terminal 1: local Postgres (PGlite) on port 54329
npm run db:setup             # terminal 2: tables + seed
npm run dev
```

## Not in this version

- Unfinished tests aren't saved as drafts. Closing the tab mid-test loses the answers, but doesn't use up an attempt.
- No email verification. Anyone who knows a colleague's `@spyne.ai` address could sign in as them **before that person sets their own password**. Ask people to sign in soon after they're added.
