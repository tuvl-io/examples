# build-autonomous-agent
description: Add an autonomous agent that calls tools in a bounded loop until it reaches an outcome.
options:
  argument-hint: "[agent-name]"

### Body

1. Add a step of `kind: Agent` with `mode: autonomous`. Unlike `mode: completion`
   (one LLM call), it loops: the model picks tools, observes the results, and
   re-decides until done. Every `Agent` step must declare one of the two modes.
2. Declare the tools — each `ref` names ANOTHER step in the same workflow (an
   `APICall` / `MCP` / `ModelOp` / `Functional`). The description the model uses
   to choose a tool comes from that **referenced step's own top-level
   `description:`** (REQUIRED — the single source; a tool-entry `description:`
   is ignored). `parameters` (JSON Schema) is optional:
   ```yaml
   - id: triage_agent
     kind: Agent
     mode: autonomous
     agent:
       # `steering` = the agent's persistent instruction, ALWAYS injected.
       # Inline text or a pinned artifact:// reference to a `type: steering`
       # prose artifact in artifacts/ (front-matter .md).
       steering: artifact://triage-operating-policy@1
       model: default
       # skills (injected when relevant) are pinned artifact refs to
       # `type: skill` prose artifacts in artifacts/.
       skills:
         - artifact://refund-policy@1
       max_iterations: 8          # hard cap (default 8)
       token_budget: 50000        # OPTIONAL cap on cumulative tokens
       tools:
         - ref: lookup_order
           parameters:
             type: object
             properties: { order_id: { type: string } }
             required: [order_id]
         - ref: issue_refund
       outcome:
         enum: [resolved, escalate, needs_human]   # the closed set of exits
         write: agent_result                       # the single data output key
     routes:
       resolved:        format_reply
       escalate:        notify_manager
       needs_human:     hitl_review
       max_iterations:  fallback_summary           # reserved abnormal exits
       error:           alert_ops
       budget_exceeded: fallback_summary
       aborted:         alert_ops
   ```
3. **Every** `outcome.enum` value MUST be mapped in `routes:`, plus the reserved
   abnormal exits `max_iterations` / `budget_exceeded` / `error` / `aborted`
   (and `guardrail_violation` when the agent has guardrails attached).
4. The agent reads context and writes only `outcome.write`. Its final no-tool
   turn must be `{"outcome": <enum value>, "result": <payload>}` — the engine
   appends that contract clause to the steering automatically. Tool results
   return to the agent; set `writes_context: true` on a tool only if it should
   also mutate the shared workflow context.
5. For data-driven branching after an outcome (e.g. by country), route into a
   deterministic `Router` with `match:` — NEVER push that logic into the agent:
   ```yaml
   - id: route_by_country
     kind: Router
     match: { field: user.country }
     routes: { US: resolve_us, DE: resolve_eu, default: resolve_other }
   ```
6. **Steering vs skills** — both are versioned prose artifacts in the project's
   `artifacts/` directory: markdown files with YAML front-matter
   (`name` / `type: steering|skill` / `version` / `description`). `steering`
   (inline text or one artifact ref) is ALWAYS injected (persistent operating
   context); `skills` (a list of artifact refs) are injected as capabilities to
   apply when relevant. Always pin versions (`artifact://name@1`) — floating
   refs draw a validate warning.
7. OPTIONAL supervision — add a `spec.supervisor` block to the workflow to watch
   this agent live and pause / abort / steer it. See the
   `supervise-autonomous-agent` skill.
