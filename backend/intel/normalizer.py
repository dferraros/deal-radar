"""
Ontology normalization for Tech Bet Intelligence Engine.

Maps raw extracted primitive names to canonical ontology nodes.
Strategy: exact match → alias match → fuzzy match → create_new flag.
"""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class NormalizationResult:
    raw_name: str
    canonical_node_id: str | None
    canonical_name: str
    match_type: str  # exact|alias|fuzzy|new
    confidence: float
    create_new: bool


def _normalize_str(s: str) -> str:
    return s.lower().strip().replace("-", " ").replace("_", " ")


class OntologyNormalizer:
    """Maps raw primitive names to canonical ontology nodes."""

    _FUZZY_THRESHOLD = 80  # fuzzywuzzy ratio threshold

    async def normalize_single(
        self,
        raw_name: str,
        ontology: list[dict],
    ) -> NormalizationResult:
        """
        Try to match raw_name to a canonical node.
        ontology: list of {id, canonical_name, aliases: [str]}
        """
        raw_norm = _normalize_str(raw_name)

        # 1. Exact match on canonical name
        for node in ontology:
            if _normalize_str(node["canonical_name"]) == raw_norm:
                return NormalizationResult(
                    raw_name=raw_name,
                    canonical_node_id=node["id"],
                    canonical_name=node["canonical_name"],
                    match_type="exact",
                    confidence=1.0,
                    create_new=False,
                )

        # 2. Alias match
        for node in ontology:
            for alias in node.get("aliases", []):
                if _normalize_str(alias) == raw_norm:
                    return NormalizationResult(
                        raw_name=raw_name,
                        canonical_node_id=node["id"],
                        canonical_name=node["canonical_name"],
                        match_type="alias",
                        confidence=0.95,
                        create_new=False,
                    )

        # 3. Fuzzy match
        try:
            from fuzzywuzzy import fuzz
            best_score = 0
            best_node = None
            for node in ontology:
                score = fuzz.ratio(raw_norm, _normalize_str(node["canonical_name"]))
                if score > best_score:
                    best_score = score
                    best_node = node
                for alias in node.get("aliases", []):
                    score = fuzz.ratio(raw_norm, _normalize_str(alias))
                    if score > best_score:
                        best_score = score
                        best_node = node

            if best_score >= self._FUZZY_THRESHOLD and best_node:
                return NormalizationResult(
                    raw_name=raw_name,
                    canonical_node_id=best_node["id"],
                    canonical_name=best_node["canonical_name"],
                    match_type="fuzzy",
                    confidence=best_score / 100,
                    create_new=False,
                )
        except ImportError:
            pass

        # 4. No match — flag for new node creation
        return NormalizationResult(
            raw_name=raw_name,
            canonical_node_id=None,
            canonical_name=raw_name,  # use raw as provisional canonical
            match_type="new",
            confidence=0.5,
            create_new=True,
        )

    async def normalize_batch(
        self,
        raw_names: list[str],
        ontology: list[dict],
    ) -> list[NormalizationResult]:
        """Normalize a batch of raw names against the ontology."""
        results = []
        for name in raw_names:
            result = await self.normalize_single(name, ontology)
            results.append(result)
        return results
