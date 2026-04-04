---
phase: "02"
plan: "05"
subsystem: ingestion
tags: [deduplication, db-write, apscheduler, pipeline, fastapi]
dependency_graph:
  requires: [02-04-ai-extractor]
  provides: [full-pipeline, scheduler, ingest-api]
  affects: [backend/ingestion/pipeline.py, backend/main.py]
tech_stack:
  added: [fuzzywuzzy, apscheduler]
  patterns: [fuzzy-dedup, upsert-company, async-sqlalchemy-session-per-write, apscheduler-cron]
key_files:
  created:
    - backend/ingestion/deduplicator.py
    - backend/ingestion/db_writer.py
    - backend/scheduler.py
  modified:
    - backend/ingestion/pipeline.py
    - backend/main.py
decisions:
  - "Fuzzy dedup thresholds: name ratio>=85, date within 5 days, amount within 15%"
  - "Commit per deal (not batch) in db_writer for safer partial failure handling"
  - "Confidence gate at 0.3 — below this, skip write (likely extraction failure)"
  - "scheduler.py imports pipeline lazily inside job to avoid circular imports"
  - "FastAPI lifespan context manager replaces deprecated on_event handlers"
  - "POST /api/ingest/run runs synchronously within request lifecycle"
metrics:
  duration: "~20min"
  completed: "2026-04-04"
  tasks_completed: 5
  files_changed: 5
---

# Phase 02 Plan 05: Deduplicator + DB Writer + APScheduler Summary

Completes the ingestion pipeline end-to-end: fuzzy deduplication of extracted deals, PostgreSQL persistence with Company upsert logic, and a daily 7am UTC scheduled job via APScheduler wired into the FastAPI lifespan.

## What Was Built

### Part A: `backend/ingestion/deduplicator.py`

`Deduplicator.deduplicate()` walks the extracted deal list and removes cross-source duplicates using three-way matching:
- Company name: `fuzz.ratio` on normalized names (lowercase, punctuation stripped, corporate suffixes removed) with threshold >= 85
- Announced date: within 5 calendar days (both None = match)
- Amount USD: within 15% of each other (both None/0 = match)

When duplicates collide, the higher-confidence deal wins. Tie-breaking keeps the already-retained deal (the one already in the `kept` list), which favors sources processed earlier in the batch (crunchbase first in the fetcher list).

### Part B: `backend/ingestion/db_writer.py`

`write_deals()` persists deduped ExtractedDeals to PostgreSQL:
- Skips deals with `confidence < 0.3`
- Looks up Company by case-insensitive name match; creates one if not found
- Checks for exact Deal duplicate: same `company_id + announced_date + amount_usd`
- Uses `session.flush()` after Company creation (gets the ID without full commit) then `session.commit()` after each Deal write
- Returns `{ added, skipped_duplicates, errors }` counts

### Part C: `backend/ingestion/pipeline.py`

Extended from 6 steps to 8 steps:
- Step 5 (NEW): `Deduplicator().deduplicate(extracted_deals)`
- Step 6 (NEW): `write_deals(db_session, deduped_deals, all_deals)`
- Step 7 (was 5): log `IngestionRun` records per source (now includes real `deals_added` count)
- Step 8 (was 6): return summary with `added` + `skipped` keys

The `raw_deals` list passed to `write_deals` is the full `all_deals` list (same order as extraction input), so index-based lookup for `source_url`, `source_name`, and `raw_text` works correctly.

### Part D: `backend/scheduler.py`

APScheduler `AsyncIOScheduler` with a CronTrigger at `hour=7, minute=0, timezone="UTC"`. The `daily_ingestion_job()` function opens an `AsyncSessionFactory()` context manager and calls `run_ingestion()`. Imports of `pipeline` and `database` are done lazily inside the job function to avoid circular import issues at module load time.

### Part E: `backend/main.py`

- Added `@asynccontextmanager lifespan(app)` that calls `start_scheduler()` on startup and `scheduler.shutdown(wait=False)` on teardown
- Added `POST /api/ingest/run` endpoint that takes a `db: AsyncSession` dependency and runs `run_ingestion()` directly, returning the summary dict
- Replaced the old static `app = FastAPI(...)` with `app = FastAPI(..., lifespan=lifespan)`

## Deviations from Plan

None — plan executed exactly as written.

One implementation note: the plan specified `get_db_session()` in the scheduler, but the actual function in `database.py` is `AsyncSessionFactory` (an `async_sessionmaker`). Used `AsyncSessionFactory` directly as a context manager, which is the correct pattern for non-FastAPI async usage (outside of dependency injection).

## Self-Check: PASSED

All 5 files present, commit `ee68219` verified in git log.
