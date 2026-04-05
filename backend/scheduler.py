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


async def run_intel_aggregation() -> None:
    """Daily job: recompute capital-weighted technology scores. Runs at 6am UTC."""
    from backend.models import IntelObservation, IntelTechnologyScore, IntelQueue, Deal
    from sqlalchemy import select, func
    from datetime import date, timedelta
    import uuid as _uuid

    logger.info("[Intel] Starting daily technology score aggregation")

    from backend.database import AsyncSessionFactory

    async with AsyncSessionFactory() as db:
        # Determine current quarter bounds
        today = date.today()
        quarter_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)
        quarter_end = quarter_start + timedelta(days=92)

        # Get all observations with node_id
        obs_result = await db.execute(select(IntelObservation))
        all_obs = obs_result.scalars().all()

        # Group by node_id
        node_obs: dict[str, list] = {}
        for obs in all_obs:
            nid = str(obs.node_id)
            node_obs.setdefault(nid, []).append(obs)

        # Get funding per queue entry
        queue_result = await db.execute(
            select(IntelQueue).where(IntelQueue.company_id.isnot(None))
        )
        queues = queue_result.scalars().all()
        queue_funding: dict[str, float] = {}
        for q in queues:
            funding_result = await db.execute(
                select(func.sum(Deal.amount_usd))
                .where(Deal.company_id == q.company_id)
                .where(Deal.amount_usd.isnot(None))
            )
            amt = funding_result.scalar_one_or_none() or 0
            queue_funding[str(q.id)] = float(amt)

        for node_id_str, observations in node_obs.items():
            capital_score = sum(
                queue_funding.get(str(o.queue_id), 0) * (o.confidence or 0.5)
                for o in observations
            )
            company_count = len({str(o.queue_id) for o in observations})

            # Upsert score for current quarter
            existing_result = await db.execute(
                select(IntelTechnologyScore)
                .where(IntelTechnologyScore.node_id == _uuid.UUID(node_id_str))
                .where(IntelTechnologyScore.period_start == quarter_start)
            )
            existing = existing_result.scalars().first()

            if existing:
                existing.capital_weighted_score = str(capital_score)
                existing.company_count = company_count
            else:
                db.add(IntelTechnologyScore(
                    id=_uuid.uuid4(),
                    node_id=_uuid.UUID(node_id_str),
                    period_start=quarter_start,
                    period_end=quarter_end,
                    capital_weighted_score=str(capital_score),
                    company_count=company_count,
                ))

        await db.commit()
        logger.info("[Intel] Aggregation complete for %d nodes", len(node_obs))


def start_scheduler() -> None:
    """
    Start the APScheduler instance and register scheduled jobs.
    Ingestion is triggered manually via POST /api/ingest/run.
    Intel aggregation runs daily at 6am UTC.
    """
    scheduler.add_job(
        run_intel_aggregation,
        CronTrigger(hour=6, minute=0, timezone="UTC"),
        id="intel_aggregation",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[Scheduler] APScheduler started — intel aggregation scheduled daily at 06:00 UTC")
