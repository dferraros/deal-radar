"""
APScheduler — Plan 02-05

Runs the ingestion pipeline daily at 7am UTC via AsyncIOScheduler.

Usage:
  Call start_scheduler() during FastAPI lifespan startup.
  Call scheduler.shutdown() during lifespan teardown.
"""

import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def daily_ingestion_job() -> None:
    """Runs every day at 7am UTC. Pulls today's deals through the full pipeline."""
    from backend.database import AsyncSessionFactory
    from backend.ingestion.pipeline import run_ingestion

    logger.info("[Scheduler] Starting daily ingestion job for %s", date.today())

    try:
        async with AsyncSessionFactory() as session:
            result = await run_ingestion(session, date.today())
        logger.info("[Scheduler] Ingestion complete: %s", result)
    except Exception as exc:
        logger.error("[Scheduler] Daily ingestion job failed: %s", exc, exc_info=True)


def start_scheduler() -> None:
    """
    Register the daily ingestion job and start the APScheduler instance.

    Safe to call multiple times — uses replace_existing=True.
    """
    scheduler.add_job(
        daily_ingestion_job,
        CronTrigger(hour=7, minute=0, timezone="UTC"),
        id="daily_ingestion",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[Scheduler] APScheduler started — daily ingestion at 07:00 UTC")
