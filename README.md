# CogniDeal

An evidence-grounded sales copilot. Single user, no auth, no CRM integration.

The product thesis is a constraint rather than a feature: **nothing the system
asserts about a deal may exist without a link back to the record or the
transcript span that backs it.** Every risk, every recommendation, every
extracted fact cites its source, and a human decides what becomes real.

| | |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic |
| Database | Postgres 16 + pgvector (enabled and declared, not used -- see below) |
| Object storage | MinIO (S3-compatible) |
| Admin | pgAdmin 4 |
| Containers | Docker Compose |

**pgvector is enabled but unused.** Migration `0001` installs the extension
and `document_chunks.embedding` is declared `vector(1536)`, but **nothing in
this codebase computes an embedding**: every row's embedding is NULL, the HNSW
index over the column is empty, and no query uses a distance operator.
pgvector supplies a column type, distance operators and index types -- it has
no embedding model and never reads the text -- so the column is waiting on a
producer that does not exist here, and `settings.embedding_model` names an
OpenAI model while this project's provider is Groq, which serves no embeddings
endpoint. The only retrieval in the system is lexical: `content.ilike(...)`
behind the chat agent's `search_documents`, plus trigram similarity for
supersession candidates (`0016`). The declarations stay, deliberately, so that
a later backfill is a job to run rather than a migration to write.

**The product was renamed from DealPilot, and the infrastructure was not.**
`POSTGRES_USER`, `POSTGRES_DB`, `MINIO_ROOT_USER`, `MINIO_BUCKET`, the Compose
volume names and the pgAdmin bootstrap account all still read `dealpilot`. That
is deliberate, not an unfinished rename: those identifiers name a database, a
bucket and four volumes that hold real rows and real objects, so changing them
is a data migration rather than a string edit, and nobody outside this repo ever
sees them. The container names (`dealpilot-backend-1`) follow from the checkout
directory, so they move only if the directory does. Rename them at a point where
you are willing to reseed, or never.

## Where things stand

| | |
| --- | --- |
| **Schema** | 20 tables, 16 migrations, head at `0016` (plus 4 LangGraph checkpoint tables, outside Alembic by design) |
| **API** | 70 endpoints under `/api/v1`, plus unversioned `/health` |
| **AI** | 13-stage pipeline, 4 gates, worker, chat agent with 9 tools |
| **Tests** | 188 |
| **Built** | accounts · contacts · deals · stakeholders · stage history · tasks · meetings · attendees · documents · facts · risks · recommendations · commitments · briefs · chat · system |
| **Not built** | seeder · frontend screens (the UI is an auth shell for auth this backend does not have — see Known gaps) |

Two screens' worth of AI value already work **with no model calls**: the
deterministic risk detector, and the deal participants roll-up that surfaces
people who attend meetings but are not tracked as stakeholders.

Detailed references: [`docs/schema/README.md`](docs/schema/README.md) for the
data model, [`docs/api/README.md`](docs/api/README.md) for the HTTP layer,
[`docs/ai/README.md`](docs/ai/README.md) for the model layer.

## Layout

```
dealpilot/
├── frontend/                   Vite + React 19 + TypeScript
│   └── vite.config.ts          proxies /api → backend
├── backend/
│   ├── app/
│   │   ├── main.py             app factory, CORS, mounts /api/v1
│   │   ├── db/                 base · mixins · session      infrastructure
│   │   ├── models/             SQLAlchemy — the tables
│   │   ├── queries.py          reusable SQL: IS_STALLED, NEXT_ACTION, ...
│   │   ├── services/           multi-statement writes with ordering rules
│   │   ├── schemas/            Pydantic — the HTTP contract
│   │   │   ├── common.py       Page[T], ORM, WRITE
│   │   │   └── v1/             versioned alongside the routes
│   │   └── api/
│   │       ├── deps.py         pagination, get_deal_or_404
│   │       └── v1/routes/      deals/ · tasks.py · documents.py
│   ├── alembic/versions/       0001 … 0009
│   └── requirements.txt
├── docs/
│   ├── schema/README.md        the data model and why it is shaped that way
│   ├── api/README.md           the HTTP layer, conventions, column ownership
│   └── ai/README.md            the model layer, gates, execution model
├── pgadmin/servers.json
├── docker-compose.yml          postgres · pgadmin · minio · backend · frontend
└── deal-pilot-env/             Python virtualenv (gitignored)
```

**Dependencies point one way**: `db → models → queries → services → routes`.

## Requirements

- Node 22+
- Docker + Docker Compose
- Python 3.9 for the host venv — **note the version split**: the container runs
  3.12, so keep code 3.9-compatible (`Optional[X]`, `List[X]`, never `X | None`,
  which SQLAlchemy evaluates at class-creation time and rejects). Rebuilding the
  venv on 3.10+ to match the container is the better long-term fix.

## Setup

```bash
cp .env.example .env                 # Postgres, MinIO, pgAdmin, host ports
cp backend/.env.example backend/.env # app settings, DATABASE_URL, MinIO endpoints
docker compose up --build
```

Migrations run automatically on backend start. The MinIO bucket is created by
the app on first upload — no init step.

To run the backend on the host instead:

```bash
./deal-pilot-env/bin/pip install -r backend/requirements.txt
cd backend && ../deal-pilot-env/bin/alembic upgrade head
../deal-pilot-env/bin/uvicorn app.main:app --reload --port 8000
```

## Services

| Service | URL | Notes |
| --- | --- | --- |
| frontend | http://localhost:5173 | Vite dev server, proxies `/api` |
| backend | http://localhost:8000 | Swagger UI at `/docs` |
| postgres | localhost:5432 | pgvector-enabled; nothing computes embeddings -- see the note above |
| minio | localhost:9000 | S3 API; presigned preview URLs are signed for this host |
| pgadmin | http://localhost:5051 | pre-registered connection |

Host ports are configurable in `.env`.

**MinIO note.** The compose file uses `chainguard/minio`, not `minio/minio`:
MinIO archived its community edition and removed the images from Docker Hub
around October 2025, and the quay.io mirror that was the usual workaround is now
denied too. The backend speaks the S3 API, so any S3-compatible server works if
this one becomes unavailable.

## Environment files

| File | Read by | Purpose |
| --- | --- | --- |
| `.env` (root) | Docker Compose | Postgres/MinIO/pgAdmin credentials, host ports |
| `backend/.env` | FastAPI | app settings, `DATABASE_URL`, MinIO endpoints, chunking |

Two MinIO endpoints exist on purpose. `MINIO_ENDPOINT` is where the *backend*
reaches MinIO (the compose service name inside the network);
`MINIO_PUBLIC_ENDPOINT` is the host a presigned preview URL is signed for, which
the **browser** opens. Signing with the service name produces links that resolve
only inside the network.

## Migrations

```bash
cd backend
../deal-pilot-env/bin/alembic upgrade head
../deal-pilot-env/bin/alembic downgrade -1
```

| | |
| --- | --- |
| `0001` | enable pgvector |
| `0002` | initial schema |
| `0003` | meeting attendee name always recorded |
| `0004` | `deal_contacts` surrogate id + partial unique indexes |
| `0005` | stage history ordered by deal |
| `0006` | meeting read paths |
| `0007` | drop `activities` — the timeline is derived |
| `0008` | documents are all-or-nothing |
| `0009` | link recommendations to risks, record dismissals |
| `0010` | enable `pg_trgm` for attendee name resolution |
| `0011` | meeting analysis origin and failure state |
| `0012` | detector provenance |
| `0013` | open-risk taxonomy key |
| `0014` | dirty-deal triggers and sweep cadence |
| `0015` | give a proposed data correction somewhere to land |
| `0016` | trigram index on `extracted_facts.content` -- supersession candidates by relevance, not recency |

**Two traps, both documented in `docs/schema/TASKS.md`:** a native Postgres enum
survives `DROP COLUMN`, so any migration dropping one must `DROP TYPE` as well
(`0008` does); and `create_check_constraint` runs the name through the metadata
naming convention, so dropping one by name needs raw SQL or it gets
double-prefixed.

## Adding a backend route

1. Response and request models in `backend/app/schemas/v1/<resource>.py` —
   requests use `extra="forbid"`.
2. Handler in `backend/app/api/v1/routes/` — a package once the resource has
   sub-resources, a flat module otherwise.
3. Anything multi-statement or with an ordering rule goes in `services/`.
4. A definition used by more than one route goes in `queries.py`.
5. Register in the route package's `__init__.py`; `api/v1/router.py` only knows
   about top-level resources.

Conventions in full: [`docs/api/README.md`](docs/api/README.md).

## Frontend scripts

Run from `frontend/`:

| Command | |
| --- | --- |
| `npm run dev` | dev server with HMR |
| `npm run build` | type-check and build |
| `npm run lint` | ESLint |
| `npm run preview` | preview production build |

## Known gaps

- **The frontend and backend do not connect.** `frontend/src` calls exactly
  five endpoints — `/auth/me`, `/auth/login`, `/auth/register`, `/auth/logout`,
  `/auth/refresh` — and this backend has none of them, deliberately: single
  user, no auth. Meanwhile the 70 business endpoints have no frontend consumer
  and `tabs.ts` declares four screens that are not built. The decision is to
  **strip auth from the frontend**, not to add it here; a `users` table is
  explicitly out of scope (`docs/ai/README.md` §6).
- **The worker has never been started**, and neither container has `langchain`
  installed — those requirements were added after the images were built, and
  `volumes: ./backend:/app` mounts source without reinstalling. The AI layer
  currently runs only from the host venv, so `POST /deals/{id}/analysis` marks a
  deal dirty and nothing consumes it. `docker compose build backend worker &&
  docker compose up -d worker`. On 3.12 that resolves **LangChain 1.x**, where
  `create_react_agent`'s `prompt=` is renamed `system_prompt=` — verify
  `ai/chat.py` and `ai/graph.py` before relying on it.
- **Placeholder AE identity.** `ae_display_name` in settings is how the roster
  decides which transcript speaker is us; there is no `users` table.
- **Placeholder thresholds** in `queries.py` (`STALL_THRESHOLD_DAYS`,
  `CLOSE_DATE_WARNING_DAYS`) — they should come from real dwell-time data once a
  seeder exists.
- **`meetings` and `deal_contacts` have no `origin` column**, so once both a
  human and the analyzer can write `summary`/`sentiment`/`buying_role` there is
  no way to tell which did.
