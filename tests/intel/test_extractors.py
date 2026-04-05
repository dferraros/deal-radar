# tests/intel/test_extractors.py
import pytest
from unittest.mock import patch
from backend.intel.extractors import IntelExtractor, IntelProfile, IntelPrimitive


def test_profile_dataclass():
    p = IntelProfile(
        summary="Builds autonomous drones.",
        target_user=["logistics operators"],
        workflow=["dispatch", "fly", "deliver"],
        inputs=["delivery request"],
        outputs=["completed delivery"],
        claimed_differentiators=["autonomous nav"],
        jtbd="When operators need fast delivery, they use this to automate last-mile.",
        confidence=0.87,
    )
    assert p.confidence == 0.87
    assert "logistics" in p.target_user[0]


def test_primitive_dataclass():
    pr = IntelPrimitive(
        name="Computer Vision",
        layer="model",
        explicit_vs_inferred="inferred",
        confidence=0.78,
        evidence_snippets=["navigates autonomously"],
    )
    assert pr.confidence == 0.78


@pytest.mark.asyncio
async def test_extract_profile_returns_default_on_api_error():
    extractor = IntelExtractor()
    with patch.object(extractor, '_call_llm', side_effect=Exception("API down")):
        profile = await extractor.extract_profile("some text about a company")
    assert profile.confidence < 0.3
    assert profile.jtbd is not None


@pytest.mark.asyncio
async def test_extract_primitives_returns_empty_on_api_error():
    extractor = IntelExtractor()
    profile = IntelProfile(summary="test", jtbd="test jtbd", confidence=0.5)
    with patch.object(extractor, '_call_llm', side_effect=Exception("API down")):
        primitives = await extractor.extract_primitives(profile, "some evidence text")
    assert isinstance(primitives, list)
    assert len(primitives) == 0
