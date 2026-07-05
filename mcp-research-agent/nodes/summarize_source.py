# nodes/summarize_source.py
"""Summarize one fetched source into a structured {url, title, takeaway}.

Invoked as an AutonomousAgent tool: the model supplies ``url`` and ``content``
(the readable text returned by the ``fetch_page`` MCP tool). This is a pure
Python trim/normalize step — no nested LLM call — so the agent's summarization
cost stays inside its own token budget. The structured result is returned to the
model as the tool observation (the tool does not set ``writes_context``).
"""
from __future__ import annotations

import re
from typing import Any

from tuvl.core.nodes.base import node

_MAX_TAKEAWAY_CHARS = 400


def _normalize(text: str) -> str:
    """Collapse whitespace and strip markdown/control noise."""
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def _derive_title(content: str, url: str) -> str:
    """First markdown heading or first non-empty line; fall back to the URL."""
    for line in content.splitlines():
        line = line.strip().lstrip("#").strip()
        if line:
            return line[:200]
    return url


def _first_two_sentences(content: str) -> str:
    """Two-sentence takeaway from the normalized body."""
    flat = " ".join(content.split())
    sentences = re.split(r"(?<=[.!?])\s+", flat)
    takeaway = " ".join(s for s in sentences[:2] if s).strip()
    if not takeaway:
        takeaway = flat[:_MAX_TAKEAWAY_CHARS]
    return takeaway[:_MAX_TAKEAWAY_CHARS]


@node("summarize_source")
async def summarize_source(ctx: dict[str, Any]) -> tuple[dict[str, Any], str]:
    url = str(ctx.get("url") or "").strip()
    content = _normalize(str(ctx.get("content") or ""))

    summary = {
        "url": url,
        "title": _derive_title(content, url),
        "takeaway": _first_two_sentences(content),
    }
    ctx["source_summary"] = summary
    return ctx, "default"
