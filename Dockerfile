# ── Stage 1: Export dependencies from Poetry ──────────────────────────────────
FROM python:3.12-slim AS deps
RUN pip install --no-cache-dir poetry poetry-plugin-export
WORKDIR /app
COPY pyproject.toml poetry.lock* ./
RUN poetry export -f requirements.txt --without-hashes -o requirements.txt && \
    poetry export -f requirements.txt --without-hashes --with dev -o requirements-dev.txt

# ── Stage 2: Production base ──────────────────────────────────────────────────
FROM python:3.12-slim AS base
WORKDIR /app
COPY --from=deps /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 3: Dev (includes dev deps + hot reload) ─────────────────────────────
FROM python:3.12-slim AS dev
WORKDIR /app
COPY --from=deps /app/requirements-dev.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
# In dev mode src/ and data/ are volume-mounted for hot reload
COPY pyproject.toml ./

# ── Stage 4: Test ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS test
WORKDIR /app
COPY --from=deps /app/requirements-dev.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY pyproject.toml ./
COPY src/ ./src/
COPY backend/ ./backend/
COPY data/ ./data/
CMD ["pytest", "backend/tests/", "-v", "--cov=src", "--cov-report=term-missing", "--cov-fail-under=85"]

# ── Stage 5: Production ───────────────────────────────────────────────────────
FROM base AS production
COPY src/ ./src/
COPY data/migrations/ ./data/migrations/
# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser && \
    mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser
ENV ENVIRONMENT=production
EXPOSE 4000
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "4000", "--workers", "1"]
