"""Validator-compatibility shim for the built-in ``DataSearch`` RAG runner.

See ``nodes/DataIngest.py`` for the full rationale. In short: ``tuvl validate``
(2026.2.6) only resolves ``runner:`` names against files in ``nodes/`` and does
not know about the engine's built-in RAG runners, so this shim exposes the
built-in under its canonical name. It holds NO retrieval logic — it delegates
verbatim to the engine's ``_data_search``, so runtime behaviour is identical to
the built-in Reciprocal-Rank-Fusion runner.
"""

from typing import Any

from tuvl.core.nodes.base import node
from tuvl.core.nodes.rag import _data_search


@node("DataSearch")
async def DataSearch(ctx: dict[str, Any]) -> dict[str, Any]:
    return await _data_search(ctx)
