from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid

from backend.database import get_session
from backend.models import AlertRule

router = APIRouter(tags=["alerts"])


class AlertRuleCreate(BaseModel):
    label: Optional[str] = None
    min_amount_usd: Optional[int] = None
    deal_type: Optional[str] = None
    sector: Optional[str] = None
    geo: Optional[str] = None
    investor_name: Optional[str] = None
    webhook_url: Optional[str] = None


class AlertRuleResponse(AlertRuleCreate):
    id: str
    is_active: bool
    last_triggered_at: Optional[str] = None
    created_at: Optional[str] = None


@router.get("/alerts", response_model=list[AlertRuleResponse])
async def list_alerts(db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(AlertRule).order_by(AlertRule.created_at.desc()))
    rules = result.scalars().all()
    return [_to_response(r) for r in rules]


@router.post("/alerts", response_model=AlertRuleResponse, status_code=201)
async def create_alert(body: AlertRuleCreate, db: AsyncSession = Depends(get_session)):
    rule = AlertRule(id=uuid.uuid4(), **body.model_dump())
    db.add(rule)
    await db.commit()
    return _to_response(rule)


@router.delete("/alerts/{alert_id}", status_code=204)
async def delete_alert(alert_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == uuid.UUID(alert_id)))
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    await db.delete(rule)
    await db.commit()


@router.patch("/alerts/{alert_id}/toggle", response_model=AlertRuleResponse)
async def toggle_alert(alert_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == uuid.UUID(alert_id)))
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    rule.is_active = not rule.is_active
    await db.commit()
    return _to_response(rule)


def _to_response(rule: AlertRule) -> AlertRuleResponse:
    return AlertRuleResponse(
        id=str(rule.id),
        label=rule.label,
        min_amount_usd=rule.min_amount_usd,
        deal_type=rule.deal_type,
        sector=rule.sector,
        geo=rule.geo,
        investor_name=rule.investor_name,
        webhook_url=rule.webhook_url,
        is_active=rule.is_active,
        last_triggered_at=rule.last_triggered_at.isoformat() if rule.last_triggered_at else None,
        created_at=rule.created_at.isoformat() if rule.created_at else None,
    )
