## ProfSkor - Startup Grade Setup

Full-stack profile intelligence software with:
- Supabase auth + Postgres persistence
- FastAPI scoring backend with rate limiting and admin metrics
- React frontend with protected routes and analytics/history

## Local Run

### 1) Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## Required Environment Variables

Root `.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RATE_LIMIT` (optional, default `60`)
- `ADMIN_API_SECRET` (optional, for admin endpoint access)

Frontend `frontend/.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` (default `http://127.0.0.1:8001`)

## Supabase Bootstrap

Run SQL in Supabase SQL editor:

`supabase/schema.sql`

This creates:
- `scores`
- `saved_profiles`
- `user_preferences`
- `resume_reviews`
- `subscriptions`
- `audit_logs`

Includes indexes and row-level security policies.

## Testing and CI

- Backend tests: `pytest backend/test_main.py`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `cd frontend && npm run build`

CI workflow:
- `.github/workflows/ci.yml`

## Deploy

- Frontend: Vercel (set frontend env vars)
- Backend: Railway or Render (set root env vars)
- Supabase: managed auth/database
