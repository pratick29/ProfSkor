# ProfSkor

**A resume that proves itself.**

ProfSkor turns your resume into a live page at `/r/your-name`: accounts you've proved are yours get a verified badge, projects show real GitHub stars and commit dates, and you can see when a recruiter opens it and what they read. It also scores your GitHub, LeetCode and LinkedIn profiles and gives you specific, prioritised suggestions, using live data from the GitHub and LeetCode APIs.

## E-resume

| Feature | What it does |
|---|---|
| **Import** | Upload your current PDF resume and it's split into editable sections (AI when `OPENAI_API_KEY` is set, a rule-based parser otherwise), or pull your best original repos from GitHub as projects |
| **Editor with live preview** | Basics, skills, experience, projects, education and achievements. Autosaves to your account; guests get a browser draft that moves to their account when they sign in |
| **Public page** | `/r/<handle>`, publish or unpublish any time. Email and phone can be hidden, and hidden fields are stripped by the server |
| **Verified accounts** | Put a one-time code in your GitHub bio or LeetCode summary to prove the account is yours. Verified accounts show live stats (repos, stars, contributions, problems solved, contest rating) that the candidate can't type in. The email gets a badge when it matches the confirmed account email |
| **Evidence links** | Projects that are repos of the verified GitHub account show a "Verified repo" badge with live stars, forks and last commit. Skills are marked when a project, job or GitHub repo on the page backs them up; clicking a skill shows where |
| **PDF** | One-click PDF from the editor or the public page (print stylesheet, A4), with a link back to the live version |
| **Views** | Anonymous view analytics: views, unique visitors, time on page, which sections were read, which links were clicked, referrers. Make a tracked link per application (`?via=google-swe`) to see which company opened it. No cookies; visitors are counted with a daily-rotating hash, and your own visits don't count |

## Profile scoring

| Feature | What it does |
|---|---|
| **GitHub score** | Original repos (forks excluded), stars (log scale), real yearly contributions and active weeks (with a GitHub token), plus checks for missing descriptions, topics and bio |
| **LeetCode score** | Easy / Medium / Hard solved, max and current streak, active days in the last 90, contest rating and percentile |
| **LinkedIn checklist** | Profile completeness and posting frequency, with a tip for each gap |
| **Resume review** | Upload a PDF and get an AI review (OpenAI) or rule-based checks: contact info, sections, quantified impact, action verbs, length. Paste a job description to see which keywords you're missing |
| **Full score** | Weighted overall score across platforms; weights can be adjusted per role |
| **History & analytics** | Saved scores and progress over time; delete saved profiles |
| **Shareable score links** | Anyone with a saved profile's link (`/search?id=…`) can view it. The link is an unguessable UUID; guest profiles stay in the browser and can't be shared |
| **Guest mode** | Try everything without an account; results stay in your browser |

Profile URLs work as input too: `https://github.com/you` and `https://leetcode.com/u/you/` are accepted.

## How scoring works

Each platform score is 0-100. Every signal earns its weight in proportion to a target value, then the total is normalised so custom weights always add up to 100.

- **GitHub:** 25 original repos · 150 stars (diminishing returns) · 500 contributions/year · active in 75% of weeks. Without `GITHUB_TOKEN`, activity is estimated from repo push dates and the response says `"data_quality": "estimated"`.
- **LeetCode:** 150 Easy · 250 Medium · 60 Hard · 60-day max streak · 40 active days in the last 90 (70%) plus contest percentile (30%).
- **Overall:** weighted average of the platform scores (default 40% GitHub, 30% LeetCode, 30% LinkedIn).

The logic is in [`backend/core/scoring.py`](backend/core/scoring.py) and [`backend/core/leetcode_scoring.py`](backend/core/leetcode_scoring.py).

## Tech stack

- **Frontend:** React 19, Vite, Tailwind, Recharts, Framer Motion. Deployed on Vercel.
- **Backend:** FastAPI, Python 3.12. Deployed on Render.
- **Data & auth:** Supabase (Postgres with row-level security, Supabase Auth).

```
frontend (React) --Bearer JWT--> backend (FastAPI) --> GitHub REST/GraphQL, LeetCode GraphQL, OpenAI
        \                              \
         `---- Supabase Auth            `---- Supabase Postgres (service role, server-side only)
```

## Run locally

**1. Backend**

```bash
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in values
cd backend
uvicorn main:app --reload --port 8001
```

API docs: http://127.0.0.1:8001/docs. `GET /health` shows which optional features are switched on.

**2. Frontend**

```bash
cd frontend
npm install
cp .env.example .env          # then fill in values
npm run dev
```

Open http://localhost:5173.

### Environment variables

Backend (`.env` in the repo root; see [`.env.example`](.env.example)):

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | For accounts/history | Database access. **Server-side only, never commit it** |
| `GITHUB_TOKEN` | Recommended | Real contribution data and 5,000 GitHub requests/hour instead of 60. A fine-grained token with no permissions is enough |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional | AI resume review; falls back to rule-based checks |
| `CORS_ORIGINS` | In production | Your frontend URL(s), comma-separated |
| `RATE_LIMIT`, `TRUSTED_PROXY_HOPS` | Optional | Requests/minute per client; set hops to `1` behind Render's proxy |
| `CACHE_TTL_SECONDS` | Optional | How long GitHub/LeetCode lookups are cached (default 1 hour) |
| `ADMIN_API_SECRET` | Optional | Lets scripts call `/admin/metrics` with an `X-Admin-Secret` header |
| `VIEW_HASH_SALT` | Optional | Salt for anonymous e-resume visitor IDs. Defaults to one derived from the service role key |

Frontend (`frontend/.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the anon key, never the service role key), `VITE_API_URL`.

### Database

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. It creates the tables, indexes and row-level security policies, and is safe to re-run (do that after upgrading to get the `resumes` and `resume_views` tables).

Keep **Auth → Providers → Email → Confirm email** switched on: the e-resume's email badge relies on the account email being confirmed.

To make a user an admin, set their `app_metadata` (not `user_metadata`, which users can edit themselves):

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}' where email = 'you@example.com';
```

## Tests

```bash
pytest backend -q             # 55+ tests, external APIs and the database mocked
cd frontend && npm run lint && npm run build
```

CI runs all of these on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Deploy

- **Backend → Render:** [`render.yaml`](render.yaml) is a blueprint. Add the secret env vars in the Render dashboard and set `CORS_ORIGINS` to your Vercel URL.
- **Frontend → Vercel:** set the root directory to `frontend` and add the three `VITE_` env vars.
- **Supabase:** run the schema, and add your Vercel URL under Auth → URL Configuration.

## Security notes

- The API only trusts Supabase access tokens. User IDs in headers or request bodies are ignored.
- Admin access requires `app_metadata.role = "admin"`.
- Rate limiting and caching are in-memory, which is fine for a single instance. Move them to Redis before running several instances.

## Roadmap

- **E-resume phase 2:** a tailored version per job (paste a job description, get a version that leads with the matching projects, each with its own link) and a requirements checklist that maps every requirement to evidence on the page
- **E-resume phase 3:** "Ask this resume" (recruiters ask questions answered only from the resume and verified data) and recruiter actions (request interview, save to shortlist)
- Open Graph preview image for `/r/<handle>` links
- Role benchmarks ("how you compare to other backend candidates")
