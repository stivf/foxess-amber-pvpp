# ADR-007: Docker-Based Development and Deployment

## Status

Accepted

## Context

Battery Brain needs a consistent development and deployment environment. The backend is Python/FastAPI with SQLite storage, the web dashboard is Next.js, and the mobile app is React Native. We need to decide how to package and run these components.

Key considerations:
- Developers should be able to run the full backend stack with a single command
- Production deployment should be reproducible and isolated
- SQLite database file needs to persist across container restarts
- The system should run on modest hardware (home server, small VM, Raspberry Pi)

## Options Considered

### Option A: Docker Compose for dev + production Dockerfile (selected)

Use `docker-compose.yml` for local development (backend + any supporting services). Use a production Dockerfile for deployment. Frontend and mobile remain outside Docker (standard Node.js tooling).

**Pros:** Consistent environments. Single `docker compose up` for dev. Production image is self-contained. SQLite file is bind-mounted for persistence and easy backup. Widely understood tooling.
**Cons:** Docker adds ~100MB overhead. Slightly more complex than bare-metal for a simple Python app. ARM builds needed for Raspberry Pi deployment.

### Option B: Bare-metal with virtualenv

Run Python directly on the host with a virtualenv.

**Pros:** Simplest possible setup. No Docker overhead.
**Cons:** Environment differences between dev and production. Dependency conflicts with system Python. Manual process management.

### Option C: Kubernetes / k3s

Container orchestration for production.

**Pros:** Auto-scaling, rolling updates.
**Cons:** Massive overhead for a single-user personal tool. k3s is lighter but still overkill.

## Decision

**Option A: Docker Compose for dev, production Dockerfile for deployment.**

### Development setup

A single service runs the FastAPI application, which includes the data pipeline collectors and aggregation via APScheduler (in-process, started during FastAPI lifespan). No separate pipeline process needed.

```yaml
# docker-compose.yml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: dev
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src          # Hot reload
      - ./data:/app/data        # SQLite DB + migrations
    env_file: .env              # API keys, DB_PATH, site config
    environment:
      - ENVIRONMENT=development
      - LOG_LEVEL=debug
      - DB_PATH=/app/data/battery_brain.db
    command: uvicorn src.api.main:app --host 0.0.0.0 --port 3000 --reload
    restart: unless-stopped
```

### Dockerfile (multi-stage, Poetry)

Uses `poetry export` to generate a pinned requirements file for the final image. This avoids installing Poetry in the production image, keeping it slim.

```dockerfile
# ── Stage 1: Export dependencies from Poetry ─────────────────────────
FROM python:3.12-slim AS deps
RUN pip install --no-cache-dir poetry
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN poetry export -f requirements.txt --without-hashes -o requirements.txt && \
    poetry export -f requirements.txt --without-hashes --with dev -o requirements-dev.txt

# ── Stage 2: Production base ─────────────────────────────────────────
FROM python:3.12-slim AS base
WORKDIR /app
COPY --from=deps /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 3: Dev (includes dev deps + hot reload) ────────────────────
FROM python:3.12-slim AS dev
WORKDIR /app
COPY --from=deps /app/requirements-dev.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# ── Stage 4: Production ──────────────────────────────────────────────
FROM base AS production
COPY src/ ./src/
COPY data/migrations/ ./data/migrations/
ENV ENVIRONMENT=production
EXPOSE 3000
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "1"]
```

**Why `poetry export` instead of installing Poetry in the final image:**
- Poetry is ~40MB installed. The production image only needs pip-installed packages.
- `poetry.lock` guarantees reproducible builds. `poetry export` converts the lock to a pinned requirements.txt.
- The `deps` stage is cached by Docker -- it only rebuilds when `pyproject.toml` or `poetry.lock` change.

### Key deployment details

- **SQLite persistence**: The `data/` directory is bind-mounted from the host. The database file (`battery_brain.db`) lives on the host filesystem, not inside the container. This means:
  - Data survives container rebuilds
  - Backup = copy the file from the host
  - If the pipeline is ever separated into its own container, both can mount the same path
- **Single worker**: Uvicorn runs with `--workers 1`. SQLite does not benefit from multiple workers, and WAL mode works best with a single writer. The in-process scheduler (APScheduler) also requires a single process.
- **ARM support**: The base image (`python:3.12-slim`) supports ARM64 natively. No special build steps needed for Raspberry Pi 4/5.
- **Environment variables**: API keys (FoxESS, Amber, Solcast) are passed via `.env` file or Docker environment variables. Never baked into the image.

### Services NOT in Docker

- **Next.js web dashboard**: Standard `npm run dev` / `npm run build`. Deployed as static build or via Vercel/Netlify. Connects to backend API at configurable URL.
- **React Native mobile app**: Standard Expo / React Native CLI workflow. Not containerizable in a meaningful way.

## Consequences

**What becomes easier:**
- `docker compose up` starts the entire backend -- no Python version management, no virtualenv setup
- Production deployment is a single `docker pull` + `docker run` (or `docker compose up -d`)
- Environment parity between dev and production
- Easy to add services later (e.g., reverse proxy, monitoring) by adding to compose file
- Clean teardown -- `docker compose down` leaves no artifacts except the SQLite file

**What becomes harder:**
- Developers need Docker installed (standard tooling, minor friction)
- Debugging requires attaching to container or using mapped ports (mitigated by volume mounts and `--reload`)
- File permission issues possible with bind-mounted SQLite on some host OSes (mitigated by running as non-root with matching UID)
- Hot reload requires volume mounts, which can be slow on macOS (not an issue on Linux)
