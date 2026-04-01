# MyAICoach — Product Documentation

**Version:** 1.0
**Last updated:** April 2026
**Live URL:** https://deeyan-grade10-studyapp.vercel.app
**Repository:** deeyan-bio (GitHub → Vercel auto-deploy)

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Stories](#2-user-stories)
3. [Features List](#3-features-list)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Database Schema](#5-database-schema)
6. [API Endpoints](#6-api-endpoints)
7. [Frontend Component Tree](#7-frontend-component-tree)
8. [AI Integration Design](#8-ai-integration-design)
9. [Data Pipeline](#9-data-pipeline)
10. [Skills Framework](#10-skills-framework)
11. [Multi-User Design](#11-multi-user-design)
12. [Quality Assurance](#12-quality-assurance)
13. [Known Limitations & Future Work](#13-known-limitations--future-work)

---

## 1. Product Overview

### What It Is

MyAICoach is an AI-powered study and self-assessment application for Grade 10 ICSE students. It provides a structured, personalised practice environment across three core subjects — Biology, History & Civics, and Chemistry — with AI evaluation of written answers, real-time feedback, skill-level progress tracking, and weekly summaries.

### Who It Is For

The primary user is a Grade 10 ICSE student (originally built for a student named Deeyan). The app is designed to support independent study between school sessions and exam preparation. It scales to multiple students via Google OAuth and per-user data isolation.

### The Problem It Solves

ICSE Grade 10 students preparing for board exams need to answer a large volume of questions across complex subjects. Traditional self-study has two core problems:

1. **No feedback on written answers.** Students write short and long answers but have no reliable way to check if their answer is correct, partially correct, or wrong — unless a teacher marks it. This feedback loop is slow and unavailable at 10pm before an exam.

2. **No visibility into weaknesses.** Students don't know which sub-topics within a subject they are weakest in, so they can't target their study efficiently.

MyAICoach solves both problems: it uses Claude to evaluate written answers in real time with subject-specific leniency, and it tracks accuracy by skill across every chapter so students can see exactly where to focus next.

---

## 2. User Stories

### US-01: Google Sign-In
**As a** student, **I want to** sign in with my Google account, **so that** my progress is saved securely across devices.

**Acceptance Criteria:**
- A "Sign in with Google" button is displayed on the login page.
- Clicking it redirects to Google OAuth and returns to the app.
- The user's name and avatar appear in the sidebar after login.
- If I navigate to the app without being signed in, I am shown the login page.
- Signing out clears the session and returns me to the login page.

---

### US-02: Subject Switching
**As a** student, **I want to** switch between Biology, History & Civics, and Chemistry, **so that** I can practise whichever subject I need at the time.

**Acceptance Criteria:**
- All three subjects are listed in the sidebar with an icon and label.
- The active subject is visually highlighted.
- Switching subject updates the Dashboard, Quiz, Skill Tracker, and Summary for that subject.
- The selected subject persists in `localStorage` so it is remembered across page refreshes.

---

### US-03: Dashboard Overview
**As a** student, **I want to** see a dashboard showing my overall progress for the current subject, **so that** I can quickly understand where I stand.

**Acceptance Criteria:**
- Dashboard shows total questions attempted, overall accuracy percentage, and number of topics covered.
- Accuracy is colour-coded: blue ≥70%, amber 40–69%, red <40%.
- A "Start Quiz" section shows all available chapters as buttons.
- A "Focus Areas" section lists up to 3 weak skills with accuracy bars.
- If no data exists, a prompt to start the first quiz is shown.

---

### US-04: Quiz Configuration
**As a** student, **I want to** configure a quiz by choosing question type, number of questions, and chapters, **so that** I can practise exactly what I need.

**Acceptance Criteria:**
- Question type options: Mixed, MCQ, Short Answer, Long Answer.
- Question count options: 5, 10, 15, 20, 30.
- All available chapters for the current subject are shown as selectable toggles.
- A "Select All / Deselect All" toggle is available.
- If no chapters are selected, all chapters are used.
- Starting a quiz creates a `sessions` row in Supabase.

---

### US-05: MCQ Practice
**As a** student, **I want to** answer multiple-choice questions and get instant right/wrong feedback, **so that** I can quickly test my recall.

**Acceptance Criteria:**
- Four options (a–d) are displayed as clickable buttons.
- Clicking an option immediately marks it correct (green) or incorrect (red).
- The correct answer is always highlighted green after answering.
- The result and skill score are recorded in Supabase.
- If the question has an explanation in the database, it is shown after answering.

---

### US-06: Short and Long Answer Practice
**As a** student, **I want to** type (or speak) written answers to short and long-answer questions, **so that** I can practise the kind of writing required in ICSE board exams.

**Acceptance Criteria:**
- A textarea is shown for written input.
- A microphone button triggers the Web Speech API for voice input (where supported).
- Submitting the answer sends it to `/api/evaluate` for AI evaluation.
- A loading state is shown while evaluation is in progress.
- Result (correct / partially correct / incorrect), score, and feedback are displayed.
- The model answer is always revealed after submission.

---

### US-07: AI Answer Evaluation
**As a** student, **I want** my written answers to be evaluated fairly by AI, **so that** I get accurate feedback without being penalised for paraphrasing or minor omissions.

**Acceptance Criteria:**
- The AI returns one of three verdicts: `correct`, `partial`, or `incorrect`.
- Synonyms, paraphrasing, and lay terms are accepted (e.g. "windpipe" for "trachea").
- For History & Civics: dates within ±1 year and alternate spellings are accepted.
- Partial credit is awarded when the student has some but not all required points.
- The AI defaults to `correct` when in doubt between correct and partial, and `partial` when in doubt between partial and incorrect.
- Score is 1.0 (correct), 0.5 (partial), or 0 (incorrect).

---

### US-08: Self-Mark Fallback
**As a** student, **I want to** self-mark my answer if the AI evaluation service is unavailable, **so that** my progress is still recorded.

**Acceptance Criteria:**
- If `/api/evaluate` fails or returns a network error, a self-marking panel appears.
- The model answer is displayed.
- Three buttons are shown: "Got it", "Partially", "Missed it".
- Selecting one records the result in the same way as AI evaluation.

---

### US-09: AI Explanation on Demand
**As a** student, **I want to** request a detailed explanation after answering any question, **so that** I can understand the concept more deeply, not just whether I was right or wrong.

**Acceptance Criteria:**
- An "Explain this in detail" link appears after every answered question.
- Clicking it sends a request to `/api/explain`.
- The explanation is tailored to whether the student was correct, partial, or incorrect.
- For MCQ questions, the explanation addresses why the correct option is right and (if the student was wrong) why their choice was incorrect.
- The explanation is displayed in a blue information panel.

---

### US-10: Quiz Results Screen
**As a** student, **I want to** see a summary of my performance at the end of a quiz, **so that** I can review which questions I got right and wrong.

**Acceptance Criteria:**
- A score percentage is shown prominently with a label (Excellent / Good job / Keep practising).
- Total correct/total questions and chapter name are shown.
- Every question is listed with its result (tick / tilde / cross), question text, and skill tag.
- For incorrect MCQs, the student's wrong answer and the correct answer are both shown.
- For short answers, the feedback from AI evaluation is shown.
- Buttons to "Try Again" or return to Dashboard are provided.

---

### US-11: Skill Tracker
**As a** student, **I want to** see my accuracy broken down by skill and chapter, **so that** I know precisely which topics to focus on next.

**Acceptance Criteria:**
- All skills for the current subject are listed, grouped by chapter.
- Each skill shows correct/total attempts and a percentage accuracy bar.
- Bars are colour-coded: blue ≥70%, amber 40–69%, red <40%.
- A radar/spider chart gives a visual overview of all skills at a glance.
- Each chapter has a "Practice" button that jumps to a quiz pre-filtered to that chapter.

---

### US-12: Radar Chart Visualisation
**As a** student, **I want to** see a spider/radar chart of all my skills, **so that** I can spot imbalances in my knowledge at a glance.

**Acceptance Criteria:**
- The radar chart renders all skills for the current subject as axes.
- Each axis is scaled from 0–100% accuracy.
- Grid rings at 25%, 50%, 75%, and 100% are visible.
- The data polygon is filled with a semi-transparent colour.
- Data points on the polygon are interactive dots.
- A legend alongside the chart shows each skill's exact percentage.

---

### US-13: Reset Practice History
**As a** student, **I want to** reset my practice history for a chapter or all chapters, **so that** I can start fresh without losing my skill scores.

**Acceptance Criteria:**
- A "Reset" button is available per chapter and a "Reset All Chapters" button exists globally.
- Clicking either shows a confirmation dialog before taking action.
- On confirmation, all `sessions` and `session_answers` rows for that chapter/subject are deleted.
- Skill scores (`skill_scores` table) are explicitly NOT deleted.
- The skill tracker refreshes immediately after reset.

---

### US-14: Weekly AI Summary
**As a** student, **I want to** generate a weekly study summary written by AI, **so that** I can get an encouraging, personalised overview of what I've covered and what to focus on.

**Acceptance Criteria:**
- The Weekly Summary page shows questions done, accuracy, and sessions completed this week.
- A "Generate" button sends this week's skill data to `/api/summary`.
- The AI produces a 4–5 sentence summary acknowledging performance, celebrating strengths, identifying weak areas, and giving one actionable tip.
- The summary is persisted in `weekly_summaries` and survives a page refresh.
- A "Regenerate" button allows refreshing the summary.

---

### US-15: Multi-Student Support
**As a** second student using the same app, **I want** my progress to be completely separate from other users, **so that** my data does not leak to or affect anyone else's.

**Acceptance Criteria:**
- Every `sessions`, `skill_scores`, and `weekly_summaries` row includes a `user_id` column.
- Supabase Row Level Security policies ensure each user can only read/write their own rows.
- Signing in with a new Google account produces a clean, empty progress state.
- Two users practising simultaneously do not see each other's data.

---

### US-16: Voice Input
**As a** student, **I want to** speak my answer instead of typing it, **so that** I can practise answering questions quickly, especially when I am studying hands-free.

**Acceptance Criteria:**
- A microphone button appears in the answer textarea for short/long answer questions.
- The button is only shown on browsers that support the Web Speech API.
- While recording, the button pulses red and a "Listening…" indicator is shown.
- Speech is transcribed and appended to the textarea.
- Clicking the button again stops recording.

---

### US-17: Unconfigured State Banner
**As a** developer setting up the app locally, **I want to** see a clear setup banner if Supabase credentials are missing, **so that** I know immediately what configuration is needed.

**Acceptance Criteria:**
- If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set, a banner is shown instead of the app.
- The banner shows the exact env var names required and a code snippet for the `.env` file.
- No part of the authenticated app renders until credentials are present.

---

## 3. Features List

### Authentication
| Feature | Status |
|---|---|
| Google OAuth sign-in via Supabase Auth | Done |
| Session persistence across page refreshes | Done |
| Sign-out functionality | Done |
| Auth-gated app (login required before accessing any page) | Done |

### Navigation & Subjects
| Feature | Status |
|---|---|
| Subject switcher (Biology / History & Civics / Chemistry) | Done |
| Subject selection persisted in localStorage | Done |
| Sidebar with navigation links (Dashboard, Quiz, Skills, Summary) | Done |
| User avatar and display name from Google profile | Done |

### Dashboard
| Feature | Status |
|---|---|
| Per-subject stats: questions done, accuracy, topics covered | Done |
| Accuracy colour coding (blue / amber / red) | Done |
| Chapter selection grid with direct-to-quiz buttons | Done |
| Focus Areas: top 3 weak skills with accuracy bars | Done |

### Quiz
| Feature | Status |
|---|---|
| Quiz configuration: question type, count, chapters | Done |
| Multi-chapter selection with per-chapter question distribution | Done |
| MCQ questions with instant feedback | Done |
| Short and long answer questions with AI evaluation | Done |
| Voice input (Web Speech API) for written answers | Done |
| Self-mark fallback when AI evaluation unavailable | Done |
| Progress bar during quiz | Done |
| AI-powered "Explain this in detail" button | Done |
| Results screen with per-question breakdown | Done |
| Session and answer recording in Supabase | Done |
| Skill score update via RPC after each answer | Done |

### Skill Tracking
| Feature | Status |
|---|---|
| Skill scores per subject/skill/chapter | Done |
| Accuracy bars per skill, grouped by chapter | Done |
| SVG radar/spider chart for skill overview | Done |
| Chapter-level accuracy roll-up | Done |
| Reset practice history per chapter | Done |
| Reset all practice history for a subject | Done |
| "Practice" shortcut from skill tracker to chapter quiz | Done |

### Weekly Summary
| Feature | Status |
|---|---|
| Week-to-date stats (questions, accuracy, sessions) | Done |
| AI-generated personalised weekly summary | Done |
| Summary persisted in database (one per subject per week) | Done |
| Regenerate summary button | Done |
| All-time skill score breakdown on summary page | Done |

### Question Bank
| Feature | Status |
|---|---|
| Biology: 15 chapters, ~800 questions | Done |
| History & Civics: 17 chapters, ~1200 questions | Done |
| Chemistry: 12 chapters, 1562 questions | Done |
| MCQ, short answer, and long answer types | Done |
| Skill tags on all questions (all three subjects) | Done |
| AI-Generated question badge (year_tag) | Done |

### Infrastructure
| Feature | Status |
|---|---|
| Vercel serverless functions for API | Done |
| Supabase PostgreSQL backend | Done |
| Row Level Security on all user-data tables | Done |
| GitHub → Vercel auto-deploy | Done |
| Environment variable configuration | Done |
| Unconfigured state banner for local dev | Done |

---

## 4. High-Level Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│                                                             │
│   React SPA (Vite + Tailwind)                               │
│   ┌──────────┐ ┌──────┐ ┌──────────────┐ ┌──────────────┐  │
│   │Dashboard │ │Quiz  │ │SkillTracker  │ │WeeklySummary │  │
│   └──────────┘ └──────┘ └──────────────┘ └──────────────┘  │
│                    │                  │                     │
│          REST (fetch)           @supabase/supabase-js       │
└──────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│  Vercel Serverless   │    │           Supabase              │
│  Functions           │    │                                 │
│                      │    │  PostgreSQL Database            │
│  /api/evaluate.js    │    │  ┌──────────────────────────┐   │
│  /api/explain.js     │    │  │ questions                │   │
│  /api/summary.js     │    │  │ sessions                 │   │
│                      │    │  │ session_answers          │   │
│  (Node.js runtime)   │    │  │ skill_scores             │   │
└──────────┬───────────┘    │  │ weekly_summaries         │   │
           │                │  └──────────────────────────┘   │
           ▼                │                                 │
┌──────────────────────┐    │  Auth (Google OAuth)            │
│  Anthropic API       │    │  Row Level Security             │
│                      │    │  RPCs (update_skill_score,      │
│  claude-haiku-4-5    │    │        get_weak_skills,         │
│  (evaluate/tag)      │    │        get_random_questions,    │
│                      │    │        get_chapters_for_subject)│
│  claude-sonnet-4-6   │    └─────────────────────────────────┘
│  (explain/summary)   │
└──────────────────────┘
```

### Request Data Flow

#### Quiz Answer Evaluation Flow
```
User types answer
      │
      ▼
Quiz.jsx: POST /api/evaluate
{
  question, modelAnswer, studentAnswer,
  skill, type, marks, subject
}
      │
      ▼
evaluate.js (Vercel function)
  → Builds subject-aware prompt with mark guide + leniency rules
  → Calls claude-haiku-4-5-20251001 (max_tokens: 512)
  → Parses JSON response: { result, score, feedback }
      │
      ▼
Quiz.jsx receives evaluation
  → Displays result badge + feedback
  → Calls supabase.from('session_answers').insert(...)
  → Calls supabase.rpc('update_skill_score', ...)
      │
      ▼
Skill score updated atomically in PostgreSQL
```

#### Explanation Flow
```
User clicks "Explain this in detail"
      │
      ▼
Quiz.jsx: POST /api/explain
{
  question, options, correctAnswer, userAnswer,
  skill, questionType, evaluationResult, evaluationFeedback
}
      │
      ▼
explain.js (Vercel function)
  → Builds tailored tutor prompt based on question type + result
  → Calls claude-sonnet-4-6 (max_tokens: 512)
  → Returns { explanation: "..." }
      │
      ▼
Explanation rendered in blue info panel
```

#### Weekly Summary Flow
```
User clicks "Generate"
      │
      ▼
WeeklySummary.jsx: POST /api/summary
{
  skillScores, weekStart,
  totalQuestions, correctAnswers
}
      │
      ▼
summary.js (Vercel function)
  → Computes weak/strong skills from score data
  → Calls claude-sonnet-4-6 (max_tokens: 600)
  → Returns { summary: "..." }
      │
      ▼
WeeklySummary.jsx upserts into weekly_summaries table
Summary rendered on page
```

---

## 5. Database Schema

### Table: `questions`

The central read-only question bank, populated offline via upload scripts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | e.g. `bio_101_mcq_001` |
| `subject` | TEXT | NOT NULL, DEFAULT 'biology' | `biology`, `history_civics`, `chemistry` |
| `chapter_id` | INTEGER | NOT NULL | 101–115 (bio), 101–117 (hc), 201–212 (chem) |
| `chapter_name` | TEXT | NOT NULL | Full chapter name |
| `type` | TEXT | NOT NULL, DEFAULT 'mcq' | `mcq`, `short_answer`, `long_answer` |
| `skill` | TEXT | NOT NULL | One of the subject's skill taxonomy terms |
| `year_tag` | TEXT | NULLABLE | Past paper year or `'AI Generated'` |
| `question` | TEXT | NOT NULL | The exam question text |
| `options` | JSONB | NOT NULL, DEFAULT '{}' | `{ "a": "...", "b": "...", "c": "...", "d": "..." }` for MCQ; `{}` for written |
| `answer` | TEXT | NOT NULL | Model answer text (MCQ: `'a'`/`'b'`/`'c'`/`'d'`; written: full text) |
| `explanation` | TEXT | NULLABLE | Optional static explanation for MCQ questions |

**Indexes:**
- `idx_questions_subject` on `(subject)`
- `idx_questions_chapter` on `(subject, chapter_id)`
- `idx_questions_skill` on `(subject, skill)`
- `idx_questions_type` on `(type)`

**RLS Policy:** Authenticated users have read-only access. No write access from the client.

---

### Table: `sessions`

One row per quiz session started by a user.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Session identifier |
| `user_id` | UUID | REFERENCES auth.users | The authenticated user |
| `subject` | TEXT | NOT NULL, DEFAULT 'biology' | Subject of this session |
| `started_at` | TIMESTAMPTZ | DEFAULT NOW() | When the session was created |
| `ended_at` | TIMESTAMPTZ | NULLABLE | Set when quiz is completed |
| `chapter_id` | INTEGER | NULLABLE | Single chapter ID if quiz was chapter-scoped |
| `chapter_name` | TEXT | NULLABLE | Display label for the session |
| `total_questions` | INTEGER | DEFAULT 0 | Count set on quiz completion |
| `correct_answers` | INTEGER | DEFAULT 0 | Count set on quiz completion |

**Indexes:** `idx_sessions_subject` on `(subject)`

**RLS Policy:** Users can only read/write their own rows (`user_id = auth.uid()`).

---

### Table: `session_answers`

One row per question answered within a session.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Answer record identifier |
| `session_id` | UUID | REFERENCES sessions(id) ON DELETE CASCADE | Parent session |
| `question_id` | TEXT | REFERENCES questions(id) | The question answered |
| `user_answer` | TEXT | NULLABLE | Student's raw answer text or MCQ key |
| `is_correct` | BOOLEAN | NOT NULL | Whether the answer was marked correct |
| `answered_at` | TIMESTAMPTZ | DEFAULT NOW() | Timestamp of submission |

**Indexes:** `idx_session_answers_session` on `(session_id)`

**RLS Policy:** Users can only read/write rows where the parent session belongs to them.

---

### Table: `skill_scores`

Aggregated accuracy per user per subject per skill. Updated atomically via RPC.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | UUID | REFERENCES auth.users | The authenticated user |
| `subject` | TEXT | NOT NULL, DEFAULT 'biology' | Subject |
| `skill` | TEXT | NOT NULL | Skill name from the taxonomy |
| `chapter_id` | INTEGER | NOT NULL | Source chapter |
| `chapter_name` | TEXT | NOT NULL | Source chapter name |
| `total_attempts` | INTEGER | DEFAULT 0 | Total questions attempted for this skill |
| `correct_attempts` | INTEGER | DEFAULT 0 | Correct answers for this skill |
| `last_attempted` | TIMESTAMPTZ | NULLABLE | Timestamp of most recent attempt |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Primary Key:** `(user_id, subject, skill)`

**RLS Policy:** Users can only read/write their own rows.

---

### Table: `weekly_summaries`

One AI-generated summary per user per subject per week.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Record identifier |
| `user_id` | UUID | REFERENCES auth.users | The authenticated user |
| `subject` | TEXT | NOT NULL, DEFAULT 'biology' | Subject |
| `week_start` | DATE | NOT NULL | Monday of the week (ISO date) |
| `summary_text` | TEXT | NOT NULL | AI-generated summary prose |
| `generated_at` | TIMESTAMPTZ | DEFAULT NOW() | When the summary was generated |

**Unique Constraint:** `(user_id, subject, week_start)`

**RLS Policy:** Users can only read/write their own rows.

---

### Database RPCs (Stored Functions)

#### `update_skill_score`

Atomically upserts a skill score row. Called from the client after every answered question.

```sql
CREATE OR REPLACE FUNCTION update_skill_score(
  p_subject      TEXT,
  p_skill        TEXT,
  p_chapter_id   INTEGER,
  p_chapter_name TEXT,
  p_is_correct   BOOLEAN
) RETURNS VOID
```

Uses `INSERT ... ON CONFLICT DO UPDATE` to guarantee atomic increment of `total_attempts` and `correct_attempts`. `SECURITY DEFINER` so the RLS user context does not interfere.

---

#### `get_weak_skills`

Returns the lowest-accuracy skills for the current user and subject, with a minimum of 3 attempts to filter out noise.

```sql
CREATE OR REPLACE FUNCTION get_weak_skills(
  p_subject TEXT DEFAULT 'biology',
  p_limit   INTEGER DEFAULT 5
)
RETURNS TABLE(skill TEXT, chapter_name TEXT, accuracy NUMERIC, total_attempts INTEGER)
```

---

#### `get_random_questions`

Returns a random sample of questions for a given subject/chapter/type combination. Used by the quiz to fetch question sets.

```sql
CREATE OR REPLACE FUNCTION get_random_questions(
  p_subject    TEXT DEFAULT 'biology',
  p_chapter_id INTEGER DEFAULT NULL,
  p_type       TEXT DEFAULT NULL,
  p_limit      INTEGER DEFAULT 10
) RETURNS SETOF questions
```

When `p_chapter_id` is NULL, draws from all chapters in the subject. When multiple chapters are selected in the UI, the frontend calls this RPC once per chapter and merges the results.

---

#### `get_chapters_for_subject`

Returns distinct chapter IDs and names for a subject, used to populate the chapter selection grids.

---

## 6. API Endpoints

All three endpoints are Vercel serverless functions located in the `/api/` directory. They accept `POST` requests with a JSON body and return JSON responses. The Anthropic API key is accessed via the `ANTHROPIC_API_KEY` environment variable on Vercel.

---

### `POST /api/evaluate`

Evaluates a student's written answer against the model answer using `claude-haiku-4-5-20251001`.

**Request Body:**

```json
{
  "question": "Explain the process of osmosis.",
  "modelAnswer": "Osmosis is the movement of water molecules...",
  "studentAnswer": "Water moves from low concentration to high...",
  "skill": "Plant Physiology",
  "type": "short_answer",
  "marks": 2,
  "subject": "biology"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `question` | string | Yes | The exam question text |
| `modelAnswer` | string | Yes | The correct answer from the question bank |
| `studentAnswer` | string | Yes | The student's answer; empty string returns 400 |
| `skill` | string | No | Used in the prompt for context |
| `type` | string | No | `mcq`, `short_answer`, or `long_answer` |
| `marks` | number | No | Defaults to 2; affects the evaluation rubric |
| `subject` | string | No | Defaults to `'biology'`; `'history_civics'` triggers different leniency rules |

**Response (200):**

```json
{
  "result": "partial",
  "score": 0.5,
  "feedback": "You correctly identified that osmosis involves water movement, but missed the key point that water moves from a region of higher water potential (lower solute concentration) to lower water potential."
}
```

| Field | Values | Description |
|---|---|---|
| `result` | `"correct"` / `"partial"` / `"incorrect"` | Verdict |
| `score` | `1` / `0.5` / `0` | Numeric score |
| `feedback` | string | 2–3 sentence feedback |

**Error Responses:**
- `400` — empty `studentAnswer`
- `405` — non-POST request
- `500` — Anthropic API failure

---

### `POST /api/explain`

Generates a deep educational explanation for a question using `claude-sonnet-4-6`.

**Request Body:**

```json
{
  "question": "What is the function of the mitochondria?",
  "options": { "a": "Protein synthesis", "b": "Energy production", "c": "Cell division", "d": "Waste removal" },
  "correctAnswer": "b",
  "userAnswer": "a",
  "skill": "Cell Biology",
  "questionType": "mcq",
  "evaluationResult": null,
  "evaluationFeedback": null
}
```

| Field | Type | Notes |
|---|---|---|
| `question` | string | Required |
| `options` | object | MCQ only: `{ a, b, c, d }` |
| `correctAnswer` | string | MCQ key (`'a'`–`'d'`) or written model answer |
| `userAnswer` | string | Student's answer |
| `skill` | string | Topic label |
| `questionType` | string | `'mcq'` or `'short_answer'`/`'long_answer'` |
| `evaluationResult` | string | `'correct'`, `'partial'`, `'incorrect'`, or null |
| `evaluationFeedback` | string | Feedback already given (so explanation adds depth, not repetition) |

**Response (200):**

```json
{
  "explanation": "The mitochondria is often called the powerhouse of the cell because..."
}
```

**Error Responses:**
- `405` — non-POST request
- `500` — Anthropic API failure

---

### `POST /api/summary`

Generates a weekly study summary using `claude-sonnet-4-6`.

**Request Body:**

```json
{
  "skillScores": [
    {
      "skill": "Cell Biology",
      "chapter_name": "The Cell",
      "correct_attempts": 8,
      "total_attempts": 10
    }
  ],
  "weekStart": "2026-03-30",
  "totalQuestions": 45,
  "correctAnswers": 31
}
```

| Field | Type | Notes |
|---|---|---|
| `skillScores` | array | Array of skill score objects from `skill_scores` table |
| `weekStart` | string | ISO date of Monday for this week |
| `totalQuestions` | number | Total questions answered this week |
| `correctAnswers` | number | Correct answers this week |

**Response (200):**

```json
{
  "summary": "You've had a strong week in Biology, answering 45 questions with a 69% accuracy..."
}
```

**Error Responses:**
- `400` — empty `skillScores`
- `405` — non-POST request
- `500` — Anthropic API failure

---

## 7. Frontend Component Tree

```
App.jsx
├── [if !isConfigured] SetupBanner
└── AuthProvider (AuthContext.jsx)
    └── AppShell
        ├── [if loading] Spinner
        ├── [if !user] LoginPage.jsx
        └── [if user] SubjectProvider (SubjectContext.jsx)
            └── BrowserRouter
                ├── Sidebar.jsx
                │   ├── Logo.jsx
                │   ├── Subject buttons (from SubjectContext)
                │   ├── NavLink × 4 (Dashboard, Quiz, Skills, Summary)
                │   └── User avatar + Sign out button
                └── <main>
                    └── Routes
                        ├── "/" → Dashboard.jsx
                        │   ├── StatCard × 3
                        │   ├── Chapter buttons grid
                        │   └── WeakSkill bars
                        ├── "/quiz" → Quiz.jsx
                        │   ├── [setup] QuizConfig (inline)
                        │   │   ├── QuestionType selector
                        │   │   ├── QuestionCount selector
                        │   │   └── ChapterToggle grid
                        │   ├── [loading] Spinner
                        │   ├── [running] QuestionCard (inline)
                        │   │   ├── [mcq] MCQ option buttons
                        │   │   └── [written] Textarea + VoiceButton + SubmitButton
                        │   │       └── [answered] EvaluationPanel
                        │   │           ├── [ai eval] FeedbackCard
                        │   │           ├── [unavailable] SelfMarkPanel
                        │   │           ├── ExplainButton → ExplanationPanel
                        │   │           └── NextButton
                        │   └── [results] Results (inline)
                        │       ├── ScoreHeader
                        │       └── ResultItem × N
                        ├── "/skills" → SkillTracker.jsx
                        │   ├── SkillRadar.jsx (SVG radar chart)
                        │   └── ChapterSection × N
                        │       └── SkillRow × M
                        └── "/summary" → WeeklySummary.jsx
                            ├── StatCard × 3
                            ├── SummaryCard (AI text)
                            └── SkillScoreList
```

**Context Providers:**

| Context | Exported Hooks | Purpose |
|---|---|---|
| `AuthContext` | `useAuth()` | `user`, `loading`, `signInWithGoogle`, `signOut` |
| `SubjectContext` | `useSubject()` | `subject`, `setSubject`, `subjects` |

**Routing:** React Router v6 with `BrowserRouter`. All routes fall back to `/index.html` via Vercel rewrites (SPA routing). Unknown routes redirect to `/`.

---

## 8. AI Integration Design

### Model Selection Rationale

| Endpoint | Model | Reason |
|---|---|---|
| `/api/evaluate` | `claude-haiku-4-5-20251001` | High throughput, low latency, lower cost. Evaluation is a structured classification task (correct/partial/incorrect + brief feedback) — Haiku handles this reliably. |
| `/api/explain` | `claude-sonnet-4-6` | Explanation requires nuanced reasoning, subject knowledge, and clear pedagogical writing. Sonnet produces noticeably better educational prose. |
| `/api/summary` | `claude-sonnet-4-6` | Weekly summaries are motivational, personalised writing tasks requiring warmth and coherence. Sonnet is better suited. |
| Offline tagging scripts | `claude-haiku-4-5-20251001` | Bulk classification tasks run in batches — speed and cost matter more than prose quality. |

---

### Evaluation Rubric Design (`/api/evaluate`)

The evaluation prompt is constructed dynamically based on `subject` and `marks`. The core design principles are:

**1. Subject-Specific Leniency**

For Biology:
- Accept scientific synonyms and lay terms (e.g. "food pipe" for "oesophagus").
- Accept paraphrased descriptions — exact textbook wording is NOT required.
- Credit answers that show correct understanding even if minor technical details are omitted.
- Do not penalise for British vs American spellings.
- A brief but accurate answer can still be "correct" — length is not a criterion.

For History & Civics:
- Accept alternate spellings of historical names (e.g. "Gandhiji", "Gandhi", "M.K. Gandhi" all valid).
- Accept approximate dates within ±1 year.
- Accept points in any order.
- Credit any historically accurate point, even if not in the model answer.
- For Civics: accept lay descriptions of constitutional provisions.

**2. Marks-Aware Rubric**

The prompt adapts based on the `marks` field:

```
marks = 1–3: "Expect N clear points or one solid explanation."
marks ≥ 4:   "Expect a detailed explanation with N distinct points: main concept, mechanism, and supporting details."
```

**3. Verdict Guidance (Bias Toward Leniency)**

The prompt explicitly instructs the model:
- When in doubt between "correct" and "partial" → choose **correct**.
- When in doubt between "partial" and "incorrect" → choose **partial**.
- "Incorrect" is reserved for fundamental misunderstandings, factually wrong answers, or completely off-topic responses.

**4. Response Format**

The model is instructed to return only valid JSON:

```json
{
  "result": "correct" | "partial" | "incorrect",
  "score": 1 | 0.5 | 0,
  "feedback": "2-3 sentences: acknowledge what was right, note missing points if partial/incorrect."
}
```

The function uses a regex (`/\{[\s\S]*\}/`) to extract the JSON even if the model adds surrounding prose.

---

### Explanation Prompt Design (`/api/explain`)

The explanation prompt branches on `questionType`:

**MCQ path:**
- States the correct answer text.
- If the student was wrong: explains why the chosen option was incorrect and the key difference.
- If correct: reinforces the concept and adds one interesting detail.

**Written answer path:**
- Receives the evaluation verdict (`correct`/`partial`/`incorrect`) and any feedback already given.
- Instructed NOT to repeat the prior feedback — the explanation must add depth.
- If correct: explains the underlying biology/history/chemistry in more depth.
- If partial: explains what the student got right and what the missing piece is and why it matters.
- If incorrect: explains the correct concept from scratch in simple terms.

All explanations are instructed to be 3–5 sentences, suitable for a 10th grader, with no markdown formatting.

---

### Skill Tagging Prompt Design (offline, `tagSkills.js`)

Each question is classified into the subject's skill taxonomy with a minimal prompt:

```
Classify this ICSE grade 10 [subject] question into exactly one skill.
Reply with ONLY the skill name, nothing else.

Skills: Cell Biology | Genetics & Heredity | ...

Question: [truncated to 200 chars]
Answer:   [truncated to 100 chars]
```

The result is validated by matching against the canonical taxonomy list (case-insensitive prefix match). Max tokens: 20 — the entire response should be a skill name.

---

## 9. Data Pipeline

Questions are sourced from ICSE Grade 10 study material PDFs and processed through a multi-stage pipeline before reaching the live database.

```
PDF (scanned or digital)
      │
      ▼ Python (pypdf / PyPDF2)
extractChemistry.py / parsePDF.py
  • Extract raw text page by page
  • Detect chapter boundaries via regex
  • Write chapter-segmented text to /tmp/
      │
      ▼ Python / JavaScript parsers
parseChemistry.py / parseHistoryCivics.js
  • Parse question numbers, options, answers
  • Assign chapter_id, chapter_name, subject
  • Classify type (mcq / short_answer / long_answer)
  • Output structured JSON
      │
      ▼ Upload scripts
uploadChemistry.js / uploadQuestions.js
  • Insert questions into Supabase questions table
  • Assign initial skill = subject default (placeholder)
      │
      ▼ Quality Pass 1: Bare-Term Fix
fixBareTermQuestions.js (Biology)
fixChemReactionQuestions.js (Chemistry)
  • Detect questions with no action verb (regex)
  • Rewrite with claude-haiku-4-5-20251001
  • e.g. "Osmotic pressure" → "Define and explain osmotic pressure."
  • e.g. "Silver nitrate + sodium chloride" → "Write a balanced chemical equation..."
      │
      ▼ Quality Pass 2: OCR Artifact Fix
fixChemOCRWithAI.js (Chemistry only)
  • Pre-screen for likely OCR word-splits (regex)
  • Send flagged text to claude-haiku-4-5-20251001 for repair
  • e.g. "o xide" → "oxide", "electr olysis" → "electrolysis"
      │
      ▼ Quality Pass 3: Answer Audit
auditBioAnswers.js (Biology)
  • For every short/long answer: ask Haiku "Does this answer answer this question?"
  • Collect "NO" responses
  • For each bad answer: generate a correct model answer with Haiku
  • Update database
      │
      ▼ Quality Pass 4: Skill Tagging
tagSkills.js (Biology + H&C)
Chemistry tagged inline during upload
  • Classify every question into one of the subject's skills
  • Batch size: 15 questions in parallel
  • Validate result against canonical taxonomy
      │
      ▼
LIVE: questions table, fully tagged, audited, question-text fixed
```

### Key Script Summary

| Script | Language | Purpose |
|---|---|---|
| `extractChemistry.py` | Python | PDF text extraction for Chemistry |
| `parsePDF.py` | Python | Generic PDF parsing |
| `parseChemistry.py` | Python | Chemistry question structure parsing |
| `parseHistoryCivics.js` | JavaScript | H&C question parsing |
| `uploadChemistry.js` | JavaScript | Chemistry question upload to Supabase |
| `uploadQuestions.js` | JavaScript | Generic upload script |
| `fixBareTermQuestions.js` | JavaScript | Biology bare-term question rewriting |
| `fixChemReactionQuestions.js` | JavaScript | Chemistry bare-reaction rewriting |
| `fixChemOCR.js` | JavaScript | Chemistry OCR fix (rule-based) |
| `fixChemOCRWithAI.js` | JavaScript | Chemistry OCR fix (AI-assisted) |
| `auditBioAnswers.js` | JavaScript | Biology answer relevance audit + fix |
| `checkBioAnswers.js` | JavaScript | Biology answer pre-check |
| `tagSkills.js` | JavaScript | Skill tagging for Biology + H&C |
| `scanQuestions.js` | JavaScript | General scan/inspection utility |
| `generateQuestions.js` | JavaScript | AI question generation |
| `generateHistoryCivicsAI.js` | JavaScript | H&C AI question generation |
| `generateMissingBioChapters.js` | JavaScript | Fill gaps in Biology question bank |

---

## 10. Skills Framework

### Design Principles

Skills are fixed, subject-specific taxonomies that map every question in the database to a meaningful academic concept. They serve three purposes:

1. **Evaluation context** — The AI evaluator receives the skill tag so it knows the topic domain when marking.
2. **Progress tracking** — `skill_scores` tracks accuracy per skill so the student can see their weakest areas.
3. **Visualisation** — The radar chart plots all skills on axes so the student sees a holistic strength profile.

Each subject has 8–10 skills chosen to span the full syllabus. Skills are broad enough that multiple chapters contribute to them (allowing aggregation in the radar chart) but specific enough to be meaningful.

---

### Skill Taxonomies

**Biology (8 skills):**

| Skill | Chapters it covers |
|---|---|
| Cell Biology | Cell, Cell Cycle, Tissues |
| Genetics & Heredity | Genetics, Mendel's Laws |
| Plant Physiology | Nutrition, Transport, Photosynthesis, Transpiration |
| Human Physiology | Digestion, Respiration, Circulation, Excretion |
| Nervous System & Coordination | Nervous System, Sense Organs, Hormones |
| Reproduction | Asexual and Sexual Reproduction, Pollination |
| Ecology & Environment | Ecosystems, Food Chains, Conservation |
| Diagrams & Experiments | Diagram-based and practical questions across chapters |

**History & Civics (8 skills):**

| Skill | Covers |
|---|---|
| Indian Freedom Struggle | Early nationalism, INC, Moderates and Extremists |
| Gandhi & Mass Movements | Non-cooperation, Civil Disobedience, Quit India |
| Independence & Partition | Mountbatten Plan, Partition, 1947 |
| World Wars & Fascism | WWI, WWII, Rise of Hitler, Mussolini |
| International Organisations | League of Nations, United Nations |
| Indian Constitution | Fundamental Rights, Directive Principles, Preamble |
| Executive & Parliament | President, PM, Lok Sabha, Rajya Sabha |
| Judiciary | Supreme Court, High Courts, Judicial Review |

**Chemistry (10 skills):**

| Skill | Chapters |
|---|---|
| Periodic Table & Properties | 201 |
| Chemical Bonding | 202 |
| Acids, Bases & Salts | 203 |
| Analytical Chemistry | 204 |
| Mole Concept & Stoichiometry | 205 |
| Electrolysis | 206 |
| Metallurgy | 207 |
| Study of Compounds | 208, 209, 210, 211 |
| Organic Chemistry | 212 |
| Diagrams & Experiments | Cross-cutting |

---

### Skill Tracking Mechanics

**Update:** After every answered question, the frontend calls `update_skill_score(p_subject, p_skill, p_chapter_id, p_chapter_name, p_is_correct)`. This RPC increments `total_attempts` and, conditionally, `correct_attempts` in a single atomic upsert.

**Reading:** The skill tracker reads all rows from `skill_scores` filtered by `subject` and `user_id`. It groups rows by `chapter_name` for the chapter sections, and aggregates across all chapters for the radar chart.

**Aggregation in Radar:** The radar sums `correct_attempts` and `total_attempts` across all chapters for a given skill name. This gives a holistic cross-chapter accuracy for each skill axis.

**Weak Skills:** The `get_weak_skills` RPC filters to skills with ≥ 3 attempts (to avoid noise from single attempts) and returns them sorted by accuracy ascending. The dashboard shows the top 3.

**Colour Coding:**
- Blue (≥70%): On track
- Amber (40–69%): Needs attention
- Red (<40%): Priority focus area

---

### Radar Chart Implementation

The chart is a hand-written SVG component (`SkillRadar.jsx`) — no third-party chart library is used. Implementation details:

- **N-gon grid:** Polygons at 25%, 50%, 75%, 100% of the outer radius.
- **Axis lines:** Lines from centre to each skill vertex.
- **Data polygon:** Points computed by converting each skill's accuracy to polar coordinates, then to cartesian.
- **Labels:** Positioned outside the outer ring using short display names from the `SHORT_LABELS` map to avoid truncation in the SVG viewport.
- **Size:** 340×340 SVG with `overflow: visible` to allow labels to extend beyond the bounding box.

---

## 11. Multi-User Design

### Authentication Flow

```
User visits app
      │
      ▼
App.jsx checks isConfigured (env vars present?)
      │
      ▼
AuthProvider calls supabase.auth.getSession()
      ├── Session exists → set user state → render app
      └── No session → render LoginPage
                            │
                            ▼ "Sign in with Google"
              supabase.auth.signInWithOAuth({ provider: 'google' })
                            │
                            ▼ Google OAuth redirect
              Callback to window.location.origin
                            │
                            ▼ supabase.auth.onAuthStateChange fires
              user state set → app renders
```

The `AuthContext` listens to `onAuthStateChange` for the lifetime of the app, so token refreshes and sign-outs are handled automatically without polling.

The `user` object from Supabase Auth includes:
- `user.id` — UUID, used as `user_id` in all user-data tables.
- `user.user_metadata.full_name` — Google display name.
- `user.user_metadata.avatar_url` — Google profile picture URL.
- `user.email` — Google email, used as fallback display name.

---

### Row Level Security Strategy

RLS is enabled on all five tables. The pattern for user-data tables is:

```sql
-- sessions example (same pattern for skill_scores, weekly_summaries)
CREATE POLICY "Users see own sessions"
  ON sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

The `questions` table has a simpler policy — any authenticated user can read all questions (the question bank is shared), but no client can write to it:

```sql
CREATE POLICY "Authenticated read-only"
  ON questions FOR SELECT
  USING (auth.role() = 'authenticated');
```

The `session_answers` table is indirectly secured: clients can only insert rows with a `session_id` that belongs to a session they own, enforced by the foreign key and the sessions RLS policy.

RPCs (`update_skill_score`, `get_weak_skills`, `get_random_questions`) use `SECURITY DEFINER` so they execute with elevated privileges, but each function internally scopes queries to `auth.uid()` where applicable.

---

### Data Isolation Guarantee

Each student who signs in with a different Google account gets:
- A unique `auth.uid()`.
- Empty `skill_scores`, `sessions`, `session_answers`, and `weekly_summaries` initially.
- No ability to read or write any other user's rows.
- The same shared `questions` table (read-only).

This means the app can be used by any number of ICSE Grade 10 students simultaneously without any data cross-contamination.

---

## 12. Quality Assurance

Significant post-extraction QA work was performed on the question bank before launch. This section documents what was done and why.

---

### QA-01: Biology Answer Audit (224 fixes)

**Problem:** When questions and answers are extracted from PDFs, question-answer pairing can go wrong if the PDF layout is non-standard. Some answers were paired with the wrong question (e.g. a question about osmosis had a model answer about genetics).

**Process (`auditBioAnswers.js`):**
1. Fetch all Biology short and long answer questions.
2. For each question, call `claude-haiku-4-5-20251001` with the prompt: "Does this answer actually answer this question? Reply YES or NO only."
3. Collect all "NO" responses.
4. For each mismatched pair, generate a new correct model answer using Haiku with chapter context.
5. Update the `answer` field in Supabase.

**Result:** 224 Biology answers audited and fixed.

---

### QA-02: Biology Bare-Term Questions (385 rewrites)

**Problem:** Many ICSE past papers print questions in a format like:
```
Define the following:
(a) Osmotic pressure
(b) Wall pressure
```
When extracted from PDF, the instruction line ("Define the following:") is often parsed as a separate heading and lost, leaving bare terms like "Osmotic pressure" as the question text. These are useless as exam questions — the student doesn't know what to do.

**Detection (`fixBareTermQuestions.js`):**
- Questions with no action verb (define/explain/state/describe/etc.)
- Length < 100 characters
- No question mark

**Fix:** Claude-haiku-4-5-20251001 rewrites each bare term into a proper instruction:
- Single term → "Define [term]." or "Explain [term]."
- Comparison → "Differentiate between [A] and [B]."
- Process → "Explain the process of [X]."

**Result:** 385 Biology questions rewritten.

---

### QA-03: Chemistry OCR Spacing Artifacts (108 fixes)

**Problem:** The Chemistry PDF was scanned or had non-standard encoding, causing word splits at syllable boundaries:
- "o xide" → should be "oxide"
- "carb on" → should be "carbon"
- "electr olysis" → should be "electrolysis"
- "sulph ate" → should be "sulphate"

**Detection (`fixChemOCRWithAI.js`):**
A regex pre-screens for common OCR split patterns (e.g. `\bo\s+xide\b`, `\bcarb\s+on\b`, etc.) to avoid sending clean text to the API unnecessarily.

**Fix:** Flagged text is sent to claude-haiku-4-5-20251001 with the instruction: "Fix OCR spacing errors. ONLY fix word-split errors. Do not change chemical formulas, numbers, punctuation, or correct text."

**Result:** 108 Chemistry questions and answers fixed.

---

### QA-04: Chemistry Bare-Reaction Questions (366 rewrites)

**Problem:** Chemistry past papers frequently format reaction questions as:
```
Give equations for:
(i) Silver nitrate solution and sodium chloride solution.
(ii) Zinc and dilute sulphuric acid.
```
Again, the instruction is lost during extraction, leaving reaction descriptions with no action verb.

**Detection (`fixChemReactionQuestions.js`):**
Same ACTION_WORDS regex as the Biology bare-term fixer, with Chemistry-specific action words added (`calculate`, `balance`, `convert`, `deduce`, etc.).

**Fix:** Claude-haiku-4-5-20251001 rewrites each bare description:
- Two reacting chemicals → "Write a balanced chemical equation and state your observation when [A] is mixed with [B]."
- Single chemical process → "Write the equation for the reaction of [X]."
- Physical action → "Write the equation when [X] is heated / treated with [Y]."

**Result:** 366 Chemistry questions rewritten.

---

### QA-05: Skill Tagging (all questions)

**Problem:** Questions were uploaded with placeholder skill values. The skill tracker and radar chart are meaningless without accurate skill tags.

**Process (`tagSkills.js`):**
- Batch size of 15 parallel requests to Haiku.
- Prompt provides the canonical skill list for the subject and the question + truncated answer.
- Response validated against the canonical list using case-insensitive prefix matching.

**Result:** All Biology, H&C, and Chemistry questions tagged with one of the subject's core skills. Chemistry questions were tagged inline during upload.

---

### QA Summary Table

| Pass | Subject | Script | Problem Fixed | Count |
|---|---|---|---|---|
| Answer Audit | Biology | `auditBioAnswers.js` | Wrong answer paired with question | 224 |
| Bare-Term Fix | Biology | `fixBareTermQuestions.js` | Questions missing action verb | 385 |
| OCR Artifact Fix | Chemistry | `fixChemOCRWithAI.js` | Word-split OCR errors in text | 108 |
| Bare-Reaction Fix | Chemistry | `fixChemReactionQuestions.js` | Reaction descriptions missing instruction | 366 |
| Skill Tagging | All subjects | `tagSkills.js` | Placeholder skill values | All questions |

---

## 13. Known Limitations & Future Work

### Current Limitations

**L-01: Chemistry skill tagging quality**
Chemistry questions cover 10 skills mapped non-linearly to 12 chapters. Tagging for Chemistry was done at upload time with a simpler approach compared to the dedicated `tagSkills.js` pipeline used for Biology and H&C. Some Chemistry questions may be tagged to the `Study of Compounds` catch-all skill when a more specific tag would be appropriate.

**L-02: `explain.js` is Biology-centric**
The prompts in `/api/explain` explicitly mention "biology tutor" even when the user is studying History & Civics or Chemistry. The explanation quality is not significantly impacted (Claude adapts), but it is technically incorrect and should be made subject-aware.

**L-03: `summary.js` is Biology-centric**
The weekly summary prompt asks Claude to "Write a weekly biology study summary" regardless of the active subject. This should be parameterised by subject.

**L-04: `WeeklySummary.jsx` hard-codes subject on upsert**
The upsert in `WeeklySummary.jsx` writes `subject: 'biology'` regardless of the active subject, meaning History & Civics and Chemistry summaries will be overwritten or stored incorrectly. This is a bug that needs a one-line fix (use `subject.id` from context).

**L-05: No pagination on skill scores**
The Skill Tracker fetches all `skill_scores` rows in one query. For subjects with many chapters and skills this is fine at current scale (~10 skills × 15 chapters = 150 rows max), but would need pagination or a tighter query if the subject count grows significantly.

**L-06: Session reset does not delete skill scores**
By design, resetting practice history does not affect skill scores. This is intentional (skill scores are a long-term record), but students who want a complete reset including skill scores currently have no UI to do so.

**L-07: Voice input browser support**
Web Speech API is not available in all browsers (notably Firefox on desktop). The voice button is hidden when unsupported, but no fallback or warning is shown to the user.

**L-08: No offline support**
The app requires a live network connection to Supabase (for questions and data) and to Vercel (for AI evaluation). There is no service worker or local caching.

---

### Future Work

**FW-01: Fix subject-awareness in explain.js, summary.js, and WeeklySummary.jsx**
Pass the `subject` field through to all three and update prompts accordingly. This is a low-effort, high-correctness fix.

**FW-02: Mathematics and Physics subjects**
The architecture supports adding new subjects by: (1) extracting and uploading questions, (2) defining a skill taxonomy, (3) adding the subject to `SUBJECTS` in `SubjectContext.jsx`. A future version could cover all six ICSE Grade 10 subjects.

**FW-03: Spaced repetition scheduling**
Currently, questions are served randomly. A spaced repetition algorithm (e.g. SM-2) could prioritise questions the student has answered incorrectly or not attempted recently, improving long-term retention.

**FW-04: Streak and gamification**
Daily login streaks, session milestones, and accuracy badges could improve motivation and daily usage habits.

**FW-05: Per-question difficulty rating**
Track how often each question is answered incorrectly across all users (anonymised aggregate) to compute a difficulty score, then surface harder questions more often for students who are performing well.

**FW-06: Parent/teacher view**
A read-only dashboard that a parent or teacher can access (with the student's permission) showing progress over time, weak areas, and recent quiz results.

**FW-07: Improved Chemistry skill tagging**
Re-run the dedicated `tagSkills.js` pipeline on Chemistry questions with the 10-skill Chemistry taxonomy to replace the upload-time tagging.

**FW-08: Question flagging**
Allow students to flag questions they believe are wrong or unclear. Flagged questions go into a review queue for manual correction.

**FW-09: Mobile-responsive layout**
The current layout uses a fixed 224px sidebar which is not optimised for small screens. A mobile-first redesign (e.g. bottom navigation on mobile, slide-in sidebar) would make the app usable on phones.

**FW-10: Historical performance charts**
A line chart showing accuracy over time (by week or by session) would give students visibility into their improvement trajectory, not just their current state.

---

*End of product documentation.*
