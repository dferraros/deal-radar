"""
Crunchbase Fetcher — Phase 7

Fetches recent funding rounds from Crunchbase v4 API.
Requires CRUNCHBASE_API_KEY environment variable.

Returns RawDeal objects normalized from Crunchbase funding_round entities.
"""

import logging
import os
from datetime import date, timedelta

import aiohttp

from backend.ingestion.base import RawDeal

logger = logging.getLogger(__name__)

_API_BASE = "https://api.crunchbase.com/api/v4"
_INVESTMENT_TYPE_TO_ROUND = {
    "seed": "Seed",
    "pre_seed": "Pre-Seed",
    "series_a": "Series A",
    "series_b": "Series B",
    "series_c": "Series C",
    "series_d": "Series D",
    "series_e": "Series E",
    "series_f": "Series F",
    "venture": "Venture Round",
    "corporate_round": "Corporate Round",
    "convertible_note": "Convertible Note",
    "debt_financing": "Debt Financing",
    "equity_crowdfunding": "Equity Crowdfunding",
    "post_ipo_equity": "Post-IPO Equity",
    "post_ipo_debt": "Post-IPO Debt",
    "secondary_market": "Secondary Market",
    "grant": "Grant",
    "non_equity_assistance": "Non-Equity Assistance",
    "initial_coin_offering": "ICO",
    "product_crowdfunding": "Crowdfunding",
    "undisclosed": None,
}


class CrunchbaseFetcher:
    """Fetch recent funding rounds from Crunchbase v4 API."""

    def __init__(self):
        self._api_key = os.environ.get("CRUNCHBASE_API_KEY")

    async def fetch(self, target_date: date) -> list[RawDeal]:
        if not self._api_key:
            logger.info("[Crunchbase] CRUNCHBASE_API_KEY not set — skipping")
            return []

        date_from = (target_date - timedelta(days=7)).isoformat()
        date_to = target_date.isoformat()

        try:
            return await self._fetch_funding_rounds(date_from, date_to)
        except Exception as exc:
            logger.error("[Crunchbase] Fetch failed: %s", exc, exc_info=True)
            return []

    async def _fetch_funding_rounds(
        self, date_from: str, date_to: str
    ) -> list[RawDeal]:
        """Query /searches/funding_rounds for the date range."""
        url = f"{_API_BASE}/searches/funding_rounds"
        headers = {
            "X-cb-user-key": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "field_ids": [
                "identifier",
                "announced_on",
                "money_raised",
                "investment_type",
                "funded_organization_identifier",
                "funded_organization_location",
                "lead_investor_identifiers",
                "investor_identifiers",
                "short_description",
            ],
            "query": [
                {
                    "type": "predicate",
                    "field_id": "announced_on",
                    "operator_id": "gte",
                    "values": [date_from],
                },
                {
                    "type": "predicate",
                    "field_id": "announced_on",
                    "operator_id": "lte",
                    "values": [date_to],
                },
            ],
            "order": [{"field_id": "announced_on", "sort": "desc"}],
            "limit": 100,
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status == 401:
                    logger.error("[Crunchbase] Invalid API key (401)")
                    return []
                if resp.status == 429:
                    logger.warning("[Crunchbase] Rate limited (429)")
                    return []
                resp.raise_for_status()
                data = await resp.json()

        entities = data.get("entities", [])
        logger.info("[Crunchbase] Received %d funding rounds", len(entities))

        deals = []
        for entity in entities:
            raw = self._entity_to_raw_deal(entity)
            if raw:
                deals.append(raw)

        return deals

    def _entity_to_raw_deal(self, entity: dict) -> RawDeal | None:
        props = entity.get("properties", {})

        # Company name — required
        org = props.get("funded_organization_identifier", {})
        company_name = org.get("value") if isinstance(org, dict) else None
        if not company_name:
            return None

        # Amount
        money = props.get("money_raised", {})
        amount_usd = None
        currency = None
        if isinstance(money, dict):
            amount_usd = money.get("value_usd")
            currency = money.get("currency")
        amount_raw = f"{amount_usd} USD" if amount_usd else "undisclosed"

        # Date
        announced_on = props.get("announced_on", "")
        date_raw = announced_on or ""

        # Round label
        inv_type = props.get("investment_type", "")
        round_label = _INVESTMENT_TYPE_TO_ROUND.get(inv_type, inv_type or None)

        # Investors
        lead_investors = props.get("lead_investor_identifiers", []) or []
        all_investors = props.get("investor_identifiers", []) or []
        lead_str = lead_investors[0].get("value", "") if lead_investors else ""
        all_inv_str = ", ".join(
            i.get("value", "") for i in all_investors if isinstance(i, dict)
        )

        # Description / summary text
        desc = props.get("short_description", "") or ""
        raw_text = (
            f"{company_name} raised {amount_raw} in a {round_label or inv_type} round. "
            f"Announced: {announced_on}. {desc} "
            f"Lead investor: {lead_str}. All investors: {all_inv_str}."
        ).strip()

        return RawDeal(
            source="crunchbase",
            company_name=company_name,
            amount_raw=amount_raw,
            date_raw=date_raw,
            url=f"https://www.crunchbase.com/funding_round/{entity.get('identifier', {}).get('permalink', '')}",
            raw_text=raw_text,
        )
