"""
Health check endpoints for the analysis engine.
"""

import importlib
from typing import Any

from fastapi import APIRouter

router = APIRouter(tags=["health"])


def _check_library(module_name: str) -> dict[str, Any]:
    """Check if a library is importable and return its version if available."""
    try:
        mod = importlib.import_module(module_name)
        version = getattr(mod, "__version__", "unknown")
        return {"status": "ok", "version": version}
    except ImportError as e:
        return {"status": "missing", "error": str(e)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Basic liveness check."""
    return {"status": "ok", "version": "1.0.0"}


@router.get("/health/dependencies")
async def dependency_check() -> dict[str, Any]:
    """Check that all key statistical libraries are importable."""
    libraries = {
        "prophet": _check_library("prophet"),
        "causalpy": _check_library("causalpy"),
        "pymc": _check_library("pymc"),
        "statsmodels": _check_library("statsmodels"),
        "ruptures": _check_library("ruptures"),
        "pandas": _check_library("pandas"),
        "numpy": _check_library("numpy"),
        "arviz": _check_library("arviz"),
        "scipy": _check_library("scipy"),
        "fastapi": _check_library("fastapi"),
        "pydantic": _check_library("pydantic"),
    }

    all_ok = all(lib["status"] == "ok" for lib in libraries.values())

    return {
        "status": "ok" if all_ok else "degraded",
        "libraries": libraries,
    }
