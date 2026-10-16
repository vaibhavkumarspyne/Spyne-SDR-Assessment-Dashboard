-- Idempotent: safe to run on every deploy via `npm run db:setup`.

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT,
  role             TEXT NOT NULL DEFAULT 'trainee' CHECK (role IN ('admin', 'trainee')),
  password_hash    TEXT,
  session_version  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tests (
  id                   SERIAL PRIMARY KEY,
  title                TEXT NOT NULL,
  week                 TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  pass_pct             INTEGER NOT NULL DEFAULT 75,
  max_attempts         INTEGER NOT NULL DEFAULT 2,
  live_at              TIMESTAMPTZ NOT NULL,
  answers_released_at  TIMESTAMPTZ,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id             SERIAL PRIMARY KEY,
  test_id        INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  topic          TEXT NOT NULL DEFAULT '',
  prompt         TEXT NOT NULL,
  options        JSONB NOT NULL,
  correct_index  INTEGER NOT NULL,
  why            TEXT NOT NULL DEFAULT '',
  example        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS questions_test_idx ON questions (test_id, position);

CREATE TABLE IF NOT EXISTS attempts (
  id            SERIAL PRIMARY KEY,
  test_id       INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers       JSONB NOT NULL,
  score         INTEGER NOT NULL,
  total         INTEGER NOT NULL,
  pct           INTEGER NOT NULL,
  passed        BOOLEAN NOT NULL,
  started_at    TIMESTAMPTZ,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_user_idx ON attempts (user_id, test_id);
CREATE INDEX IF NOT EXISTS attempts_test_idx ON attempts (test_id);

-- Written (subjective) tests, added after launch. Columns are added in place so existing data stays.
ALTER TABLE tests     ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'mcq';  -- 'mcq' | 'written'
ALTER TABLE questions ADD COLUMN IF NOT EXISTS max_marks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attempts  ADD COLUMN IF NOT EXISTS marks JSONB;      -- question id -> marks awarded
ALTER TABLE attempts  ADD COLUMN IF NOT EXISTS feedback JSONB;   -- question id -> marker's comment for the trainee
ALTER TABLE attempts  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;  -- null = waiting for an admin to mark it
ALTER TABLE attempts  ADD COLUMN IF NOT EXISTS graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- Multiple-choice attempts are marked the moment they're submitted.
UPDATE attempts a SET graded_at = a.submitted_at
  FROM tests t WHERE t.id = a.test_id AND t.kind = 'mcq' AND a.graded_at IS NULL;
CREATE INDEX IF NOT EXISTS attempts_ungraded_idx ON attempts (submitted_at) WHERE graded_at IS NULL;
