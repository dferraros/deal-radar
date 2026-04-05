FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Create venv at /opt/venv — Railway's saved start command activates it
RUN python -m venv --copies /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Use a shell script so errors from uvicorn startup appear in logs
CMD ["/bin/sh", "-c", "set -e && echo '=== starting alembic ===' && python -m alembic upgrade head && echo '=== alembic done, starting uvicorn ===' && exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
