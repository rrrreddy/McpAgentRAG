"""Resolves the sample_data/ directory in both local-dev and container
layouts, since the two run from different working directories:

  - local dev: this repo checkout, sample_data/ is a sibling of backend/
  - container: WORKDIR is /app (== backend/'s contents), and
    docker-compose mounts sample_data at /app/sample_data — set
    SAMPLE_DATA_DIR=/app/sample_data there to make that explicit rather
    than relying on relative-path guessing inside the image.
"""
from __future__ import annotations

import os
from pathlib import Path


def sample_data_dir() -> Path:
    override = os.environ.get("SAMPLE_DATA_DIR")
    if override:
        return Path(override)
    # backend/app/paths.py -> parents[1] == backend/, parents[2] == repo root
    return Path(__file__).resolve().parents[2] / "sample_data"
