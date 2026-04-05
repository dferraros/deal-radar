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
