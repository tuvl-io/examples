---
name: agent-code
description: "Implement a code agent: a Python function inside the stub tuvl codegen generates."
---
# Code agents

```yaml
- id: score
  engine: code
  effect: read                 # none | read | write | destructive (ctx.db refuses writes under read)
  code: { run: score_order, with: { threshold: 500 } }   # with → ctx.params (templates allowed)
  inputs: { order: Order }
  outputs: { score: int }
  routes: { high: review, low: END, error: END.failed }
```

`tuvl codegen` writes/merges `agents/<run>.py`:
```python
from tuvl import Ctx, agent
from agents._generated.schemas import ScoreIn, ScoreOut, ScoreSignal

@agent("score_order")
async def score_order(inp: ScoreIn, ctx: Ctx) -> tuple[ScoreOut, ScoreSignal]:
    """(from the agent's description)"""
    value = int(inp.order.total)            # ← you write only the body
    return ScoreOut(score=value), ("high" if value > ctx.params["threshold"] else "low")
```
- Return the outputs, an `(outputs, signal)` pair, or a bare signal; every signal must be a route.
- Never edit the decorator, signature, annotations, docstring or anything in `agents/_generated/`
  — `tuvl codegen` owns them and rewrites them; your body and parameter names are preserved.
- `ctx.db.get/list/create/update/delete("Model", …)` — only models in the workflow's `spec.models`;
  writes commit atomically with the step. `ctx.http` for outbound calls with
  `ctx.idempotency_key`. `ctx.artifact("artifact://name@1")` for prose. `ctx.log` for logs.
- Built-ins (`code.run: tuvl.data_search`, `tuvl.data_ingest`) need no Python.
