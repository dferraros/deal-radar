# tests/intel/test_models.py
import pytest
from backend.models import (
    IntelQueue, IntelSource, IntelSourceChunk,
    IntelCompanyProfile, IntelOntologyNode, IntelOntologyAlias,
    IntelObservation, IntelObservationEvidence, IntelTechnologyScore,
)

def test_intel_models_importable():
    """All 9 Intel ORM models can be imported."""
    assert IntelQueue.__tablename__ == "intel_queue"
    assert IntelSource.__tablename__ == "intel_sources"
    assert IntelSourceChunk.__tablename__ == "intel_source_chunks"
    assert IntelCompanyProfile.__tablename__ == "intel_company_profiles"
    assert IntelOntologyNode.__tablename__ == "intel_ontology_nodes"
    assert IntelOntologyAlias.__tablename__ == "intel_ontology_aliases"
    assert IntelObservation.__tablename__ == "intel_observations"
    assert IntelObservationEvidence.__tablename__ == "intel_observation_evidence"
    assert IntelTechnologyScore.__tablename__ == "intel_technology_scores"

def test_intel_queue_fields():
    q = IntelQueue()
    assert hasattr(q, 'status')
    assert hasattr(q, 'website')
    assert hasattr(q, 'company_name')


from backend.intel.seed import SEED_PRIMITIVES, SEED_ALIASES, seed_ontology
import inspect

def test_seed_primitives_count():
    assert len(SEED_PRIMITIVES) == 30

def test_seed_primitives_structure():
    for entry in SEED_PRIMITIVES:
        assert len(entry) == 3, f"Expected 3-tuple, got {entry}"
        name, node_type, description = entry
        assert isinstance(name, str) and len(name) > 0
        assert isinstance(description, str)

def test_seed_aliases_count():
    assert len(SEED_ALIASES) >= 10

def test_seed_aliases_values_are_lists():
    for key, aliases in SEED_ALIASES.items():
        assert isinstance(aliases, list), f"Aliases for '{key}' must be list"
        assert len(aliases) > 0

def test_seed_ontology_is_async():
    assert inspect.iscoroutinefunction(seed_ontology)
