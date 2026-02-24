# Incremental IQ Analysis Engine - Production Docker Image
# Multi-stage build using python:3.11-slim

FROM python:3.11-slim AS base

# Install system dependencies required for PyMC/Prophet C extensions
# - gcc, g++: required for compiling PyMC/Stan C extensions
# - libffi-dev: required for cffi (used by cryptography and PyMC)
# - make: required for some build processes
# - curl: required for health check
# - build-essential: includes gcc, g++, and make
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    make \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
RUN pip install uv --no-cache-dir

WORKDIR /app

# Copy dependency specification first (for Docker layer caching)
COPY pyproject.toml .

# Install Python dependencies using uv
# --no-install-project: only installs deps, not the package itself (src not copied yet)
RUN uv pip install --system -r pyproject.toml 2>/dev/null || \
    uv pip install --system \
        prophet \
        causalpy \
        pymc-marketing \
        statsmodels \
        fastapi \
        "uvicorn[standard]" \
        ruptures \
        pandas \
        numpy \
        arviz \
        scipy \
        pydantic

# Copy application source code
COPY . .

# Expose API port
EXPOSE 8000

# Health check — curl the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the FastAPI application with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
