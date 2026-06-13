"""Application settings, loaded from environment / .env.

Secrets (Anthropic key, admin password) live here and never reach the client.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Anthropic
    anthropic_api_key: str = ""
    model: str = "claude-opus-4-8"
    max_tokens: int = 1024

    # Admin
    admin_password: str = "change-me"

    # Storage
    database_url: str = "sqlite:///./study.db"

    # Chat phase tuning (seconds / counts) — surfaced to the client.
    chat_duration_seconds: int = 480  # ~8 min countdown (a maximum)
    chat_min_seconds: int = 120  # minimum before "Continue" unlocks
    chat_min_student_messages: int = 3  # minimum student turns before unlock

    # CORS (frontend dev origin)
    frontend_origin: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
