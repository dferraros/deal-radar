# tests/intel/test_normalizer.py
import pytest
from backend.intel.normalizer import OntologyNormalizer, NormalizationResult


def test_normalization_result():
    r = NormalizationResult(
        raw_name="RAG pipeline",
        canonical_node_id=None,
        canonical_name="Retrieval augmented generation",
        match_type="alias",
        confidence=0.95,
        create_new=False,
    )
    assert r.match_type == "alias"
    assert not r.create_new


@pytest.mark.asyncio
async def test_normalize_finds_exact_match():
    normalizer = OntologyNormalizer()
    ontology = [
        {"id": "abc-123", "canonical_name": "Vector databases", "aliases": ["vector db", "vector store"]}
    ]
    result = await normalizer.normalize_single("vector databases", ontology)
    assert result.canonical_name == "Vector databases"
    assert result.match_type == "exact"
    assert result.confidence > 0.9


@pytest.mark.asyncio
async def test_normalize_finds_alias_match():
    normalizer = OntologyNormalizer()
    ontology = [
        {"id": "abc-123", "canonical_name": "Retrieval augmented generation", "aliases": ["RAG", "retrieval pipeline"]}
    ]
    result = await normalizer.normalize_single("RAG", ontology)
    assert result.canonical_name == "Retrieval augmented generation"
    assert result.match_type == "alias"


@pytest.mark.asyncio
async def test_normalize_creates_new_for_unknown():
    normalizer = OntologyNormalizer()
    ontology = [
        {"id": "abc-123", "canonical_name": "Vector databases", "aliases": []}
    ]
    result = await normalizer.normalize_single("quantum photonics computing", ontology)
    assert result.create_new is True
    assert result.match_type == "new"


@pytest.mark.asyncio
async def test_normalize_batch():
    normalizer = OntologyNormalizer()
    ontology = [
        {"id": "abc-123", "canonical_name": "Vector databases", "aliases": ["vector db"]}
    ]
    results = await normalizer.normalize_batch(["vector databases", "quantum photonics"], ontology)
    assert len(results) == 2
    assert results[0].match_type == "exact"
    assert results[1].create_new is True
