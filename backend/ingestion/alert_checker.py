"""
Alert checker — runs after each ingestion batch.

For each newly added deal, checks all active AlertRule records.
If a rule matches, fires the webhook (POST JSON) and updates last_triggered_at.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import AlertRule, Deal, Company

logger = logging.getLogger(__name__)


async def check_alerts(db: AsyncSession, new_deal_ids: list) -> int:
    """
    Check newly added deals against all active alert rules.
    Returns count of alerts fired.
    """
    if not new_deal_ids:
        return 0

    # Load new deals with company
    stmt = (
        select(Deal)
        .options(selectinload(Deal.company))
        .where(Deal.id.in_(new_deal_ids))
    )
    result = await db.execute(stmt)
    new_deals = result.scalars().all()

    # Load active rules
    rules_stmt = select(AlertRule).where(AlertRule.is_active == True)
    rules_result = await db.execute(rules_stmt)
    rules = rules_result.scalars().all()

    if not rules:
        return 0

    fired = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for deal in new_deals:
            for rule in rules:
                if _rule_matches(rule, deal):
                    await _fire_webhook(client, rule, deal, db)
                    fired += 1

    logger.info("Alert checker: %d alerts fired for %d new deals", fired, len(new_deals))
    return fired


def _rule_matches(rule: AlertRule, deal: Deal) -> bool:
    if rule.min_amount_usd and (not deal.amount_usd or deal.amount_usd < rule.min_amount_usd):
        return False
    if rule.deal_type and deal.deal_type != rule.deal_type:
        return False
    if rule.geo and deal.company and deal.company.geo != rule.geo:
        return False
    if rule.sector and deal.company:
        if not deal.company.sector or rule.sector not in deal.company.sector:
            return False
    if rule.investor_name and deal.all_investors:
        names_lower = [i.lower() for i in deal.all_investors]
        if rule.investor_name.lower() not in names_lower:
            return False
    return True


async def _fire_webhook(client: httpx.AsyncClient, rule: AlertRule, deal: Deal, db: AsyncSession):
    payload = {
        "alert_label": rule.label,
        "company": deal.company.name if deal.company else "Unknown",
        "deal_type": deal.deal_type,
        "amount_usd": deal.amount_usd,
        "round_label": deal.round_label,
        "announced_date": deal.announced_date.isoformat() if deal.announced_date else None,
        "sector": deal.company.sector if deal.company else [],
        "geo": deal.company.geo if deal.company else None,
        "investors": deal.all_investors or [],
        "source_url": deal.source_url,
    }
    try:
        if rule.webhook_url:
            resp = await client.post(rule.webhook_url, json=payload)
            logger.info("Webhook fired for rule %r → %s (%d)", rule.label, rule.webhook_url, resp.status_code)
        # Update last_triggered_at
        rule.last_triggered_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception as exc:
        logger.warning("Webhook fire failed for rule %r: %s", rule.label, exc)
