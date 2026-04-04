"""
AI Extraction Layer — Plan 02-04

Takes a RawDeal and returns a structured ExtractedDeal Pydantic model.

Primary: Claude Haiku (anthropic SDK)
Fallback: GPT-4o-mini (openai SDK) if OPENAI_API_KEY present and ANTHROPIC_API_KEY absent

Up to 10 concurrent extractions via asyncio.gather.
On any parse/API error: returns a low-confidence default ExtractedDeal instead of failing
the entire batch.
"""

import asyncio
import json
import logging
import os
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

from backend.ingestion.base import RawDeal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic model for extraction output
# ---------------------------------------------------------------------------

class ExtractedDeal(BaseModel):
    company_name: str
    company_description: Optional[str] = None
    company_website: Optional[str] = None
    deal_type: Literal["vc", "ma", "crypto", "ipo", "unknown"] = "unknown"
    amount_usd: Optional[int] = None          # in USD integer
    currency: Optional[str] = None
    round_label: Optional[str] = None         # 'Series A', 'Seed', 'Acquisition', etc.
    announced_date: Optional[date] = None
    sector: list[str] = []                    # e.g. ['crypto', 'fintech']
    geo: Optional[str] = None                 # 'latam', 'spain', 'europe', 'us', 'global', etc.
    lead_investor: Optional[str] = None
    all_investors: list[str] = []
    ai_summary: str = ""                      # 2-3 sentence summary
    confidence: float = 0.0                   # 0.0-1.0 extraction confidence

    @field_validator("announced_date", mode="before")
    @classmethod
    def parse_date(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, date):
            return v
        try:
            return date.fromisoformat(str(v)[:10])
        except (ValueError, TypeError):
            return None

    @field_validator("amount_usd", mode="before")
    @classmethod
    def parse_amount(cls, v):
        if v is None or v == "" or v == "null":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, v):
        try:
            return max(0.0, min(1.0, float(v)))
        except (ValueError, TypeError):
            return 0.0

    @field_validator("sector", "all_investors", mode="before")
    @classmethod
    def ensure_list(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            return [v] if v else []
        return []


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a financial deals analyst. "
    "Extract structured deal information from the provided text. "
    "Return only valid JSON — no markdown, no explanation, just the JSON object."
)

_USER_TEMPLATE = """\
Extract deal information from this text:

---
{raw_text}
---

Source: {source}
Date hint: {date_raw}
Amount hint: {amount_raw}

Return a single JSON object with these fields:
- company_name (string)
- company_description (string, 1 sentence, or null)
- company_website (string URL or null)
- deal_type (one of: vc / ma / crypto / ipo / unknown)
- amount_usd (integer USD, or null if undisclosed)
- currency (string or null)
- round_label (string like "Series A", "Seed", "Acquisition", or null)
- announced_date (YYYY-MM-DD or null)
- sector (array of strings from: crypto / fintech / saas / healthtech / edtech / proptech / other)
- geo (one of: latam / spain / europe / us / asia / global, or null)
- lead_investor (string or null)
- all_investors (array of strings, empty if none)
- ai_summary (string, 2-3 sentences)
- confidence (float 0.0-1.0, your extraction confidence)\
"""


def _build_user_prompt(raw: RawDeal) -> str:
    # Truncate raw_text to ~4000 chars to stay within token budget
    text = (raw.raw_text or "")[:4000]
    return _USER_TEMPLATE.format(
        raw_text=text,
        source=raw.source,
        date_raw=raw.date_raw or "unknown",
        amount_raw=raw.amount_raw or "unknown",
    )


# ---------------------------------------------------------------------------
# Default (fallback) ExtractedDeal when extraction fails
# ---------------------------------------------------------------------------

def _default_deal(raw: RawDeal) -> ExtractedDeal:
    return ExtractedDeal(
        company_name=raw.company_name or "Unknown",
        confidence=0.1,
    )


# ---------------------------------------------------------------------------
# AIExtractor
# ---------------------------------------------------------------------------

class AIExtractor:
    """
    Extracts structured deal data from RawDeal objects using an LLM.

    Primary:  Claude Haiku via anthropic SDK (ANTHROPIC_API_KEY)
    Fallback: GPT-4o-mini via openai SDK   (OPENAI_API_KEY)

    If neither key is available, returns low-confidence default ExtractedDeals.
    """

    _MAX_CONCURRENT = 10
    _MAX_TOKENS = 500
    _CLAUDE_MODEL = "claude-haiku-4-5-20251001"
    _GPT_MODEL = "gpt-4o-mini"

    def __init__(self):
        self._anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        self._openai_key = os.environ.get("OPENAI_API_KEY")

        self._anthropic_client = None
        self._openai_client = None

        if self._anthropic_key:
            try:
                import anthropic  # noqa: PLC0415
                self._anthropic_client = anthropic.AsyncAnthropic(api_key=self._anthropic_key)
                logger.info("AIExtractor: Claude Haiku ready (primary)")
            except ImportError:
                logger.warning("anthropic SDK not installed — Claude extraction unavailable")

        if not self._anthropic_client and self._openai_key:
            try:
                import openai  # noqa: PLC0415
                self._openai_client = openai.AsyncOpenAI(api_key=self._openai_key)
                logger.info("AIExtractor: GPT-4o-mini ready (fallback)")
            except ImportError:
                logger.warning("openai SDK not installed — GPT fallback unavailable")

        if not self._anthropic_client and not self._openai_client:
            logger.warning(
                "AIExtractor: no API keys found (ANTHROPIC_API_KEY / OPENAI_API_KEY). "
                "All extractions will return low-confidence defaults."
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def extract(self, raw: RawDeal) -> ExtractedDeal:
        """Extract a single RawDeal. Never raises — returns default on failure."""
        try:
            if self._anthropic_client:
                return await self._extract_claude(raw)
            if self._openai_client:
                return await self._extract_openai(raw)
        except Exception as exc:
            logger.warning(
                "AIExtractor: extraction failed for %r (%s) — returning default",
                raw.company_name,
                exc,
            )
        return _default_deal(raw)

    async def extract_batch(self, raw_deals: list[RawDeal]) -> list[ExtractedDeal]:
        """
        Extract up to _MAX_CONCURRENT deals concurrently.

        Splits into chunks of _MAX_CONCURRENT and awaits each chunk.
        One failed extraction returns a default ExtractedDeal — never blocks the batch.
        """
        if not raw_deals:
            return []

        results: list[ExtractedDeal] = []
        chunk_size = self._MAX_CONCURRENT

        for i in range(0, len(raw_deals), chunk_size):
            chunk = raw_deals[i : i + chunk_size]
            chunk_results = await asyncio.gather(
                *[self.extract(raw) for raw in chunk],
                return_exceptions=False,  # extract() already swallows exceptions
            )
            results.extend(chunk_results)
            logger.debug(
                "AIExtractor: extracted chunk %d-%d (%d deals)",
                i,
                i + len(chunk) - 1,
                len(chunk),
            )

        logger.info(
            "AIExtractor: batch complete — %d/%d deals extracted",
            len(results),
            len(raw_deals),
        )
        return results

    # ------------------------------------------------------------------
    # Private: Claude Haiku
    # ------------------------------------------------------------------

    async def _extract_claude(self, raw: RawDeal) -> ExtractedDeal:
        response = await self._anthropic_client.messages.create(
            model=self._CLAUDE_MODEL,
            max_tokens=self._MAX_TOKENS,
            messages=[
                {
                    "role": "user",
                    "content": _build_user_prompt(raw),
                }
            ],
            system=_SYSTEM_PROMPT,
        )
        raw_json = response.content[0].text.strip()
        return self._parse_response(raw_json, raw)

    # ------------------------------------------------------------------
    # Private: GPT-4o-mini fallback
    # ------------------------------------------------------------------

    async def _extract_openai(self, raw: RawDeal) -> ExtractedDeal:
        response = await self._openai_client.chat.completions.create(
            model=self._GPT_MODEL,
            max_tokens=self._MAX_TOKENS,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(raw)},
            ],
            response_format={"type": "json_object"},
        )
        raw_json = response.choices[0].message.content.strip()
        return self._parse_response(raw_json, raw)

    # ------------------------------------------------------------------
    # Private: Parse + validate
    # ------------------------------------------------------------------

    def _parse_response(self, raw_json: str, raw: RawDeal) -> ExtractedDeal:
        """Parse JSON string and validate into ExtractedDeal. Returns default on error."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            logger.warning(
                "AIExtractor: JSON parse error for %r: %s — raw: %.200s",
                raw.company_name,
                exc,
                raw_json,
            )
            return _default_deal(raw)

        try:
            return ExtractedDeal.model_validate(data)
        except Exception as exc:
            logger.warning(
                "AIExtractor: model validation error for %r: %s",
                raw.company_name,
                exc,
            )
            # Attempt minimal recovery: build default but keep any valid company_name
            name = data.get("company_name") or raw.company_name or "Unknown"
            return ExtractedDeal(company_name=name, confidence=0.1)
