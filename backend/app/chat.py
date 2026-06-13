"""Anthropic streaming proxy. The system prompt (with the hidden anchor) is
resolved server-side and never leaves this process except as model input."""
from __future__ import annotations

from collections.abc import Iterator

from anthropic import Anthropic

from .config import get_settings

settings = get_settings()

_ROLE_MAP = {"student": "user", "ai": "assistant"}

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def to_anthropic_messages(history: list[tuple[str, str]]) -> list[dict]:
    """Map stored transcript (role, content) pairs to the Anthropic format.

    student -> user, ai -> assistant. History must be ordered by ordinal.
    """
    return [{"role": _ROLE_MAP[role], "content": content} for role, content in history]


def stream_reply(system_prompt: str, anthropic_messages: list[dict]) -> Iterator[str]:
    """Yield text deltas for the assistant's reply to the latest student message.

    `anthropic_messages` must already include the new student turn as its last entry.
    """
    client = _get_client()
    with client.messages.stream(
        model=settings.model,
        max_tokens=settings.max_tokens,
        system=system_prompt,
        messages=anthropic_messages,
    ) as stream:
        for text in stream.text_stream:
            yield text
