# DealPilot

React + TypeScript (Vite) frontend with a FastAPI backend and a Postgres +
pgvector database, orchestrated with Docker Compose.

## Stack

| Layer      | Tech                                             |
| ---------- | ------------------------------------------------ |
| Frontend   | React 19, TypeScript, Vite                       |
| Backend    | FastAPI, SQLAlchemy 2 (async), Alembic           |
| Database   | Postgres 16 + pgvector (`document_chunks.embedding`) |
| Admin      | pgAdmin 4                                        |
| Containers | Docker Compose                                   |

## Layout

```
dealpilot/
├── frontend/                  # Vite + React 19 + TypeScript
│   ├── src/
│   │   ├── components/        # Layout, Sidebar, AuthForm, ...
│   │   ├── context/           # AuthContext
│   │   └── lib/api.ts
│   ├── Dockerfile
│   └── vite.config.ts         # proxies /api → http://127.0.0.1:8000
├── backend/                    # FastAPI
│   ├── app/
│   │   ├── main.py             # app factory, CORS
│   │   ├── api/router.py       # aggregates route modules
│   │   ├── api/routes/         # health.py, dashboard.py
│   │   ├── core/config.py      # pydantic-settings
│   │   ├── db/                 # session.py, base.py, mixins.py
│   │   ├── models/             # account, deal, task, document, meeting, ...
│   │   └── schemas/
│   ├── alembic/                 # migrations (pgvector, initial schema)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── pgadmin/servers.json        # pre-registered pgAdmin connection
├── docker-compose.yml          # postgres, pgadmin, backend, frontend
├── .env.example                # root env (Docker Compose substitution)
└── deal-pilot-env/             # Python virtualenv (gitignored)
```

## Requirements

- Node 22+
- Python 3.9 (the existing `deal-pilot-env` venv)
- Docker + Docker Compose (for the containerized workflow)

## Setup

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env                        # root env: Postgres, pgAdmin, ports
cp backend/.env.example backend/.env         # backend env: app settings, DATABASE_URL
docker compose up --build
```

### Option B — Run on the host

Frontend:

```bash
cd frontend
npm install
```

Backend (the venv already has the dependencies; this re-syncs it):

```bash
./deal-pilot-env/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

## Running

### Docker Compose

```bash
docker compose up
```

| Service  | URL                          | Notes                               |
| -------- | ----------------------------- | ------------------------------------ |
| frontend | http://localhost:5173         | Vite dev server                      |
| backend  | http://localhost:8000         | Docs at `/docs`                      |
| postgres | localhost:5433                | pgvector-enabled, host-mapped port   |
| pgadmin  | http://localhost:5051         | Pre-registered DealPilot connection  |

Host-side ports are configurable via `.env` (`POSTGRES_HOST_PORT`,
`BACKEND_HOST_PORT`, `FRONTEND_HOST_PORT`, `PGADMIN_HOST_PORT`).

### Host (two terminals from the repo root)

Backend — http://127.0.0.1:8000 (docs at `/docs`):

```bash
cd backend && ../deal-pilot-env/bin/uvicorn app.main:app --reload --port 8000
```

Frontend — http://localhost:5173:

```bash
cd frontend && npm run dev
```

The Vite dev server proxies `/api/*` to the backend, so client code can call
`fetch('/api/health')` with no CORS setup and no base URL.

## Environment files

| File                    | Read by         | Purpose                                                               |
| ------------------------ | ---------------- | ---------------------------------------------------------------------- |
| `.env` (repo root)       | Docker Compose   | Postgres/pgAdmin credentials, host port mappings                      |
| `backend/.env`           | FastAPI app      | App settings, `DATABASE_URL`, embedding model/dim                     |

Keep `POSTGRES_PASSWORD` (root `.env`) in sync with the password in
`backend/.env`'s `DATABASE_URL` if you run the backend outside Docker
against the same database.

## Database

- Postgres 16 with the **pgvector** extension (`pgvector/pgvector:pg16`
  image) — required by the `document_chunks.embedding` column.
- Migrations are managed with Alembic:

```bash
cd backend
../deal-pilot-env/bin/alembic upgrade head
```

| Model      | File                              |
| ---------- | ---------------------------------- |
| Account    | `backend/app/models/account.py`   |
| Deal       | `backend/app/models/deal.py`      |
| Task       | `backend/app/models/task.py`      |
| Document   | `backend/app/models/document.py` |
| Evidence   | `backend/app/models/evidence.py` |
| Assertion  | `backend/app/models/assertion.py`|
| Meeting    | `backend/app/models/meeting.py`  |
| Chat       | `backend/app/models/chat.py`     |

## Endpoints

| Method | Path                          | Description                               |
| ------ | ------------------------------ | ------------------------------------------ |
| GET    | `/api/health`                  | Liveness check                             |
| GET    | `/api/dashboard/priority-deals`| Open deals ranked by risk, then close date |
| GET    | `/docs`                        | Swagger UI (backend only)                  |

## Adding a backend route

1. Create `backend/app/schemas/<name>.py` with the Pydantic models.
2. Create `backend/app/api/routes/<name>.py` exposing an `APIRouter`.
3. Register it in `backend/app/api/router.py`.

## Frontend scripts

Run from `frontend/`:

| Command           | Description              |
| ------------------ | -------------------------- |
| `npm run dev`     | Dev server with HMR      |
| `npm run build`   | Type-check and build     |
| `npm run lint`    | ESLint                   |
| `npm run preview` | Preview production build |
