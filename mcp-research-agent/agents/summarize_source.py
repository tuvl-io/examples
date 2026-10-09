"""Summarize one fetched source — the research loop's tool.

Deterministic: derives a title and a two-sentence takeaway from the text.
"""

from __future__ import annotations

import re
from typing import Any

from tuvl import Ctx, agent


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _first_two_sentences(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(parts[:2]).strip()


def _derive_title(text: str, url: str) -> str:
    first = text.split(". ")[0][:120].strip()
    return first or url


@agent("summarize_source")
async def summarize_source(inp: Any, ctx: Ctx) -> dict[str, Any]:
    url = str(inp.url or "").strip()
    content = _normalize(str(inp.content or ""))
    return {"summary": {"url": url, "title": _derive_title(content, url), "takeaway": _first_two_sentences(content)}}
