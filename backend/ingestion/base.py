from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from abc import ABC, abstractmethod


@dataclass
class RawDeal:
    source: str                    # 'rss', 'tavily', 'firecrawl', 'crunchbase', 'manual'
    company_name: str
    amount_raw: Optional[str]      # original string e.g. "$50M", "undisclosed", None
    date_raw: str                  # original date string
    url: str
    raw_text: str                  # full article/announcement text for AI extraction
    title: Optional[str] = None    # article/announcement title


class BaseFetcher(ABC):
    @abstractmethod
    async def fetch(self, target_date: date) -> list[RawDeal]:
        """Fetch deals announced on or around target_date."""
        ...

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Unique name for this source (used in ingestion_runs logging)."""
        ...
