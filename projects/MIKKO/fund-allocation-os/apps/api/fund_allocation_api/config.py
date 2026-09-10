from functools import lru_cache
from pathlib import Path
import shutil

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def default_node_executable() -> str:
    from_path = shutil.which("node")
    if from_path:
        return from_path
    codex_node = (
        Path.home()
        / ".cache"
        / "codex-runtimes"
        / "codex-primary-runtime"
        / "dependencies"
        / "node"
        / "bin"
        / "node.exe"
    )
    return str(codex_node) if codex_node.is_file() else "node"


class Settings(BaseSettings):
    app_name: str = "Fund Allocation OS API"
    environment: str = "development"
    database_url: str = f"sqlite:///{(PROJECT_ROOT / 'data' / 'fund_allocation_os.db').as_posix()}"
    node_executable: str = default_node_executable()
    ifind_health_script: Path = PROJECT_ROOT / "scripts" / "check-ifind-fund-provider.mjs"
    ifind_data_script: Path = PROJECT_ROOT / "scripts" / "run-ifind-provider.mjs"
    ifind_health_timeout_seconds: int = 60
    ifind_required: bool = True
    auth_signing_secret: str = "development-only-change-me"
    auth_token_ttl_seconds: int = 3600
    auth_rate_limit_per_minute: int = 60

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
