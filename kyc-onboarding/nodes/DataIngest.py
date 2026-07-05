"""Expose the built-in `DataIngest` RAG runner as a project node.

`tuvl validate` has no allowlist for the engine's built-in Functional runners
(`DataIngest` / `DataSearch`), so a workflow step `runner: DataIngest` would
otherwise validate-error as "not registered in nodes/". This file registers the
name from the project so validation passes, while delegating to the genuine
engine implementation — runtime behavior is identical:

Project nodes load before `register_rag_nodes()`, which only registers the
built-in when the name is still free (`if "DataIngest" not in NODE_REGISTRY`).
Because this claims the name first with the real implementation, the built-in
no-ops and the real embed+persist path runs unchanged.
"""

from typing import Any

from tuvl.core.nodes.base import node
from tuvl.core.nodes.rag import _data_ingest


@node("DataIngest")
async def DataIngest(ctx: dict[str, Any]) -> dict[str, Any]:
    return await _data_ingest(ctx)
