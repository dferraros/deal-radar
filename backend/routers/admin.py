"""
Admin router — ingestion run history.

GET /api/admin/runs — returns newest 50 IngestionRun rows.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models import IngestionRun
from backend.schemas import IngestRunResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])


@router.get("/admin/runs", response_model=List[IngestRunResponse])
async def get_ingestion_runs(
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
) -> List[IngestRunResponse]:
    """Return ingestion run history, newest first, default limit 50."""
    stmt = (
        select(IngestionRun)
        .order_by(desc(IngestionRun.run_at))
        .limit(limit)
    )
    result = await db.execute(stmt)
    runs = result.scalars().all()
    logger.debug("[admin] Returning %d ingestion run records", len(runs))
    return runs
