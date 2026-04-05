FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (includes pre-built frontend/dist/)
COPY . .

EXPOSE 8000

CMD python -m alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
