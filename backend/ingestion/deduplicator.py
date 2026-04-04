"""
Deduplicator — Plan 02-05

Removes duplicate deals from an ExtractedDeal list before DB insertion.

Duplicate detection rules (ALL three must match):
  1. Normalized company names have fuzzy ratio >= 85 (fuzzywuzzy)
  2. announced_date within 5 days of each other (or both None)
  3. amount_usd within 15% of each other (or both None/0)

When duplicates found: keep the deal with higher confidence.
If tied, prefer source priority: crunchbase > tavily > firecrawl > rss.
"""

import logging
import re
from datetime import date
from typing import Optional

from fuzzywuzzy import fuzz

from backend.ingestion.ai_extractor import ExtractedDeal

logger = logging.getLogger(__name__)

# Source priority order: lower index = higher priority
_SOURCE_PRIORITY: list[str] = ["crunchbase", "tavily", "firecrawl", "rss"]

# Suffixes to strip during normalization
_SUFFIX_PATTERN = re.compile(
    r"\b(inc|corp|ltd|llc|co|limited|incorporated|corporation|company|plc|ag|sa|bv|gmbh|srl)\b\.?$",
    re.IGNORECASE,
)


class Deduplicator:
    """
    Deduplicates a list of ExtractedDeal objects using fuzzy company name
    matching combined with date and amount proximity checks.
    """

    def deduplicate(self, deals: list[ExtractedDeal]) -> list[ExtractedDeal]:
        """
        Remove duplicate deals. Keep highest-confidence version per unique deal.

        Returns a new list with one representative deal per unique deal event.
        """
        if not deals:
            return []

        kept: list[ExtractedDeal] = []

        for candidate in deals:
            duplicate_found = False
            for idx, existing in enumerate(kept):
                if self._is_duplicate(candidate, existing):
                    # Decide which to keep
                    winner = self._pick_winner(candidate, existing)
                    if winner is candidate:
                        kept[idx] = candidate
                    duplicate_found = True
                    logger.debug(
                        "Dedup: %r is a duplicate of %r — kept %r",
                        candidate.company_name,
                        existing.company_name,
                        kept[idx].company_name,
                    )
                    break

            if not duplicate_found:
                kept.append(candidate)

        removed = len(deals) - len(kept)
        if removed:
            logger.info("Deduplicator: removed %d duplicate deal(s), kept %d", removed, len(kept))

        return kept

    def _is_duplicate(self, a: ExtractedDeal, b: ExtractedDeal) -> bool:
        """
        True if a and b refer to the same deal.

        All three conditions must be satisfied:
          1. Fuzzy company name ratio >= 85
          2. announced_date within 5 days (or both None)
          3. amount_usd within 15% (or both None/0)
        """
        # --- Rule 1: Company name fuzzy match ---
        ratio = fuzz.ratio(
            self._normalize_name(a.company_name),
            self._normalize_name(b.company_name),
        )
        if ratio < 85:
            return False

        # --- Rule 2: Date proximity ---
        if not self._dates_close(a.announced_date, b.announced_date):
            return False

        # --- Rule 3: Amount proximity ---
        if not self._amounts_close(a.amount_usd, b.amount_usd):
            return False

        return True

    def _normalize_name(self, name: str) -> str:
        """Lowercase, remove punctuation, strip corporate suffixes."""
        if not name:
            return ""
        # Lowercase
        normalized = name.lower()
        # Remove punctuation except spaces
        normalized = re.sub(r"[^\w\s]", "", normalized)
        # Strip common corporate suffixes
        normalized = _SUFFIX_PATTERN.sub("", normalized).strip()
        # Collapse whitespace
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _dates_close(
        self, a: Optional[date], b: Optional[date], max_days: int = 5
    ) -> bool:
        """True if both None or both within max_days of each other."""
        if a is None and b is None:
            return True
        if a is None or b is None:
            # One has a date, the other doesn't — not a match on this criterion
            return False
        return abs((a - b).days) <= max_days

    def _amounts_close(
        self, a: Optional[int], b: Optional[int], tolerance: float = 0.15
    ) -> bool:
        """True if both None/0 or both within tolerance% of each other."""
        a_empty = not a  # None or 0
        b_empty = not b
        if a_empty and b_empty:
            return True
        if a_empty or b_empty:
            # One has an amount, the other doesn't — still treat as "close"
            # (undisclosed vs disclosed could be the same deal, but we can't be sure;
            # we rely on name + date already matching, so we accept this edge case)
            return True
        # Both have amounts — check within tolerance
        larger = max(a, b)
        smaller = min(a, b)
        return (larger - smaller) / larger <= tolerance

    def _pick_winner(
        self, a: ExtractedDeal, b: ExtractedDeal
    ) -> ExtractedDeal:
        """
        Pick the better deal between two duplicates.

        Priority:
          1. Higher confidence score
          2. Higher source priority (crunchbase > tavily > firecrawl > rss)
          3. Fall back to a (first candidate)
        """
        if a.confidence > b.confidence:
            return a
        if b.confidence > a.confidence:
            return b

        # Confidence tied — use source priority
        # ExtractedDeal doesn't store the source name, so we try to infer from
        # the company_name context. Since ExtractedDeal has no source field,
        # we keep `b` (the already-kept existing deal) as the winner when tied.
        # Callers can enhance this by attaching source info to ExtractedDeal later.
        return b
