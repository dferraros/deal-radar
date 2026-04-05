# tests/intel/test_intel_router.py
import pytest
from backend.routers.intel import router


def test_router_exists():
    from fastapi import APIRouter
    assert isinstance(router, APIRouter)


def test_router_has_queue_routes():
    routes = {r.path for r in router.routes}
    assert "/intel/queue" in routes


def test_router_has_dossier_route():
    routes = {r.path for r in router.routes}
    assert any("dossier" in r for r in routes)


def test_router_has_graph_route():
    routes = {r.path for r in router.routes}
    assert any("graph" in r for r in routes)


def test_router_has_trends_route():
    routes = {r.path for r in router.routes}
    assert any("trends" in r for r in routes)
