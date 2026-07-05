"""Validator-compatibility shim for the built-in ``DataIngest`` RAG runner.

The engine ships ``DataIngest`` / ``DataSearch`` as built-in Functional runners
(``tuvl.core.nodes.rag``) that are registered at app startup — no user code is
needed to *run* them. However, ``tuvl validate`` (2026.2.6) resolves a step's
``runner:`` only against node files found under ``nodes/``; it has no knowledge
of the built-in RAG runners, so a workflow that uses ``runner: DataIngest``
statically fails validation with "runner 'DataIngest' is not registered".

This one-line shim exposes the built-in under its canonical name so the static
validator resolves it. It contains NO RAG logic — it delegates verbatim to the
engine's own implementation, so runtime behaviour is identical to the built-in.
Registered before the engine's own ``register_rag_nodes()`` (which only fills a
name when it is still free), it simply claims the same name with the same
function. Remove it once the validator recognises built-in runners.
"""

from typing import Any

from tuvl.core.nodes.base import node
from tuvl.core.nodes.rag import _data_ingest


@node("DataIngest")
async def DataIngest(ctx: dict[str, Any]) -> dict[str, Any]:
    return await _data_ingest(ctx)
