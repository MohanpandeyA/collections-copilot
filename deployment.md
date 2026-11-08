# Deployment and local run

GitHub: https://github.com/MohanpandeyA/collections-copilot

## What you need

| Tool | Version used |
|---|---|
| Python | 3.11 |
| Node | 20.11 (jsdom is pinned to 25 because of this) |
| PostgreSQL | 16 |

## 1. Database

Create an empty database. The name below matches the default in `.env.example`.

```bash
createdb collections_copilot
```

## 2. Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in the values, see the table below
alembic upgrade head        # create the tables
python -m app.seed          # load the fake demo data
uvicorn app.main:app --port 8000 --reload
```

Check it: `curl http://localhost:8000/health` returns `{"status":"ok"}`.

Interactive API docs are at http://localhost:8000/docs.

### Environment variables

Names only. Put the values in `backend/.env`, which is git ignored.

| Name | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | SQLAlchemy URL, for example `postgresql+psycopg://localhost/collections_copilot` |
| `SECRET_KEY` | yes | Signs login tokens (JWT HS256). Use a long random string. |
| `FIELD_ENC_KEY` | yes | Fernet key that encrypts borrower name and phone in the database |
| `GEMINI_API_KEY` | no | Enables AI written reminders. Without it, the approved template is used. |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-latest` |
| `MESSAGING_PROVIDER` | no | `mock` (default). No real SMS or WhatsApp is sent. |
| `CORS_ORIGINS` | yes | Comma separated list of frontend origins, for example `http://localhost:5173` |

Generate the two secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"                       # SECRET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # FIELD_ENC_KEY
```

Keep `FIELD_ENC_KEY` safe. If it changes, existing encrypted names and phones can no longer be read. For demo data, re-running `python -m app.seed` with the new key fixes that.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

| Name | Required | What it is |
|---|---|---|
| `VITE_API_URL` | no | Backend address. Defaults to `http://localhost:8000`. Set it at build time for a hosted backend. |

Production build: `npm run build` writes static files to `frontend/dist`.

## 4. Demo logins

Every demo account uses the password `demo123`. All data is invented.

| Role | Username | Branch |
|---|---|---|
| Field officer | `rahul` | Indore Central |
| Field officer | `neha` | Indore Central |
| Field officer | `imran` | Indore Central |
| Field officer | `vikas` | Indore East |
| Field officer | `sunita` | Indore East |
| Field officer | `arjun` | Indore East |
| Branch manager | `manager_central` | Indore Central |
| Branch manager | `manager_east` | Indore East |

Quick tour: sign in as `manager_central` to see the dashboard, loans, promises, activity and CSV import. Sign in as `rahul` for the officer flow: open a loan, log an outcome, and draft a reminder.

## 5. Tests

```bash
cd backend && .venv/bin/python -m pytest        # 130 tests
cd frontend && npx vitest run                   # 69 tests
cd frontend && npx tsc -b                       # type check
```

**Warning:** the backend tests run `python -m app.seed` first, which clears and reloads every table in the database that `DATABASE_URL` points to. Point `DATABASE_URL` at a throwaway database when you run them, never at data you want to keep.

## 6. Notes for reviewers

- The RBI contact window (08:00 to 19:00 IST) is enforced on the server. Outside it, reminders return 409 and the call button stays off.
- The messaging gateway is mocked. A reminder is only ever sent after the officer taps send.
- Outcomes logged offline are kept in the browser (IndexedDB) and sent when the connection returns. Each one carries a `client_id`, so a retry never creates a duplicate.
- Offline loading of the app itself (service worker) is not built yet. It is listed under next steps in the TDD.
