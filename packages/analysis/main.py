"""
Incremental IQ Analysis Engine
FastAPI application entrypoint
"""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import anomalies, forecast, health, incrementality

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Analysis engine ready")
    yield


app = FastAPI(
    title="Incremental IQ Analysis Engine",
    version="1.0.0",
    description="Statistical analysis engine providing forecasting, incrementality scoring, saturation estimation, and anomaly detection for digital advertising campaigns.",
    lifespan=lifespan,
)

# CORS middleware — allow all origins for Next.js app on different port in dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check router
app.include_router(health.router)

# Statistical endpoint routers
app.include_router(forecast.router, prefix="/forecast", tags=["forecast"])
app.include_router(anomalies.router, prefix="/anomalies", tags=["anomalies"])
app.include_router(incrementality.router, prefix="/incrementality", tags=["incrementality"])

# Placeholder prefix for saturation router (implemented in Plan 04 Task 2)
#   app.include_router(saturation.router, prefix="/saturation", tags=["saturation"])
