import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.routing import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.routers import deals as deals_router
from backend.routers import companies as companies_router
from backend.routers import heatmap as heatmap_router
from backend.routers import trends as trends_router
from backend.routers import kpi as kpi_router
from backend.routers import watchlist as watchlist_router
from backend.routers import ingest as ingest_router
from backend.routers import admin as admin_router
from backend.routers import investors_leaderboard as investors_leaderboard_router
from backend.routers import briefing as briefing_router
from backend.routers import alerts as alerts_router
from backend.scheduler import scheduler, start_scheduler, daily_ingestion_job

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown hooks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start APScheduler on startup; shut it down on shutdown."""
    start_scheduler()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[Lifespan] APScheduler stopped")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Deal Radar API", version="1.0.0", lifespan=lifespan)

api_router = APIRouter(prefix="/api")


@api_router.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@api_router.post("/ingest/run", status_code=202)
async def trigger_ingestion(background_tasks: BackgroundTasks):
    """
    Manually trigger the daily ingestion pipeline.

    Returns 202 immediately; pipeline runs in the background (2-5 min).
    Check /api/admin/runs for status.
    """
    async def _run():
        from datetime import date
        from backend.database import AsyncSessionFactory as AsyncSessionLocal
        from backend.ingestion.pipeline import run_ingestion

        async with AsyncSessionLocal() as db:
            try:
                await run_ingestion(db, date.today())
            except Exception as exc:
                logger.error("[API] Background ingestion failed: %s", exc, exc_info=True)

    logger.info("[API] Manual ingestion queued via POST /api/ingest/run")
    background_tasks.add_task(_run)
    return {"status": "accepted", "message": "Ingestion started in background. Check /api/admin/runs for results."}


app.include_router(api_router)
app.include_router(deals_router.router, prefix="/api")
app.include_router(companies_router.router, prefix="/api")
app.include_router(heatmap_router.router, prefix="/api")
app.include_router(trends_router.router, prefix="/api")
app.include_router(kpi_router.router, prefix="/api")
app.include_router(watchlist_router.router, prefix="/api")
app.include_router(ingest_router.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")
app.include_router(investors_leaderboard_router.router, prefix="/api")
app.include_router(briefing_router.router, prefix="/api")
app.include_router(alerts_router.router, prefix="/api")

# Serve React build as static files — must come AFTER API routes
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # Mount assets directory
    assets_path = FRONTEND_DIST / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        """Catch-all: serve React index.html for client-side routing."""
        requested = FRONTEND_DIST / full_path
        if requested.is_file():
            return FileResponse(str(requested))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "Deal Radar API running. Frontend not built yet."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
