"""Expose the built-in `DataSearch` RAG runner as a project node.

See nodes/DataIngest.py for the full rationale. `tuvl validate` has no allowlist
for the engine's built-in Functional runners, so this registers the name from
the project (satisfying validation) while delegating to the genuine engine
implementation. Project nodes load before `register_rag_nodes()`, which then
no-ops because the name is already taken — so the real hybrid-retrieval path
runs unchanged at runtime.
"""

from typing import Any

from tuvl.core.nodes.base import node
from tuvl.core.nodes.rag import _data_search


@node("DataSearch")
async def DataSearch(ctx: dict[str, Any]) -> dict[str, Any]:
    return await _data_search(ctx)
