from pathlib import Path

from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _normalize_db_url(url: str) -> str:
    """Normalize a DATABASE_URL for production environments.

    - Render sometimes provides `postgres://...` (legacy) — SQLAlchemy 2.x
      wants `postgresql://...`.
    - For managed Postgres (Render, Neon) we ensure sslmode=require unless
      it's clearly local (localhost / 127.0.0.1 / db host inside docker).
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    is_local = any(h in url for h in ("localhost", "127.0.0.1", "@db:", "@db/"))
    if not is_local and "sslmode=" not in url and url.startswith("postgresql://"):
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    return url


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5433/almaty_analytics"
    egov_api_key: str = ""
    # Default mirrors Vite's dev-server port (5173). Override with the CORS_ORIGINS
    # env var (comma-separated) for additional origins in prod.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    model_config = {
        "env_file": str(PROJECT_ROOT / ".env"),
        "env_file_encoding": "utf-8",
    }


_raw = Settings()
# Apply DB normalization once at import time; re-export single `settings` instance.
_raw.database_url = _normalize_db_url(_raw.database_url)
settings = _raw
