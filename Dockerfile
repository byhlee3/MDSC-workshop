# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend with bun ----
FROM oven/bun:1 AS frontend
WORKDIR /fe
# Copy manifests first for better layer caching
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
# Copy the rest of the frontend source and build
COPY frontend/ ./
RUN bun run build
# Output is /fe/dist (index.html + assets/*)

# ---- Stage 2: Python backend + static frontend ----
FROM python:3.11-slim AS runtime

# Install uv (the project's package manager) from PyPI — registry-agnostic so it
# builds anywhere, no dependency on an external image registry.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Install backend deps first (cached unless pyproject/uv.lock change).
# --frozen uses the committed uv.lock exactly; --no-dev skips pytest/httpx;
# --no-install-project skips installing the app itself (we just copy app/).
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the backend application code
COPY backend/app ./app

# Copy the built frontend from stage 1 into backend/static
# (main.py resolves <module>/../static -> /app/static)
COPY --from=frontend /fe/dist ./static

# uv created a venv at /app/.venv; put it on PATH so `uvicorn` resolves
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Render injects $PORT. Shell-form CMD so $PORT expands.
# No --reload in production. Single worker keeps SQLite + streaming simple.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
