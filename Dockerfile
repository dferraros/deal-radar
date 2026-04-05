FROM python:3.11-slim

WORKDIR /app

# gcc for Python C extensions, curl + Node 20 for frontend build
RUN apt-get update && apt-get install -y gcc curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Python venv
RUN python -m venv --copies /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend — install deps first (layer cache), then copy source and build
COPY frontend/package*.json frontend/
RUN cd frontend && npm install

COPY frontend/ frontend/
RUN cd frontend && npm run build

# Backend source (copied last so Python changes don't bust npm cache)
COPY . .

EXPOSE 8000

CMD ["/bin/sh", "-c", "set -e && echo '=== starting alembic ===' && python -m alembic upgrade head 2>&1 && echo '=== alembic done, starting uvicorn ===' && exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} 2>&1"]
