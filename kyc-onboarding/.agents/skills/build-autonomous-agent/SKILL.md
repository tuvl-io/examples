# build-autonomous-agent
description: Add an autonomous agent that calls tools in a bounded loop until it reaches an outcome.
options:
  argument-hint: "[agent-name]"

### Body

1. Add a step of `kind: AutonomousAgent`. Unlike `kind: Agent` (one LLM call), it
   loops: the model picks tools, observes the results, and re-decides until done.
2. Declare the tools — each `ref` names ANOTHER step in the same workflow (an
   `APICall` / `MCP` / `ModelOp` / `Functional`). The description the model uses
   to choose a tool comes from that **referenced step's own top-level
   `description:`** (REQUIRED — set it on the step); an inline `description:`
   here overrides it. `parameters` (JSON Schema) is optional:
   ```yaml
   - id: triage_agent
     kind: AutonomousAgent
     agent:
       # `steering` = the agent's persistent instruction, ALWAYS injected.
       steering: "Resolve the customer ticket using the available tools."
       model: default
       # steering_files (always injected) and skills (injected when relevant) are
       # per-agent markdown, scoped to agents/<workflow>__<stepId>/{steering,skills}/.
       steering_files:
         - agents/support__triage_agent/steering/operating-policy.md
       skills:
         - agents/support__triage_agent/skills/refund-policy.md
       max_iterations: 8          # hard cap (default 8)
       token_budget: 50000        # OPTIONAL cap on cumulative tokens
       tools:
         - ref: lookup_order
           description: "Fetch order details by order id."
           parameters:
             type: object
             properties: { order_id: { type: string } }
             required: [order_id]
         - ref: issue_refund
           description: "Issue a refund for an order id and amount."
       outcome:
         enum: [resolved, escalate, needs_human]   # the closed set of exits
         output_key: agent_result                  # the single data output
     routes:
       resolved:        format_reply
       escalate:        notify_manager
       needs_human:     hitl_review
       max_iterations:  fallback_summary           # reserved abnormal exits
       error:           alert_ops
       budget_exceeded: fallback_summary
   ```
3. **Every** `outcome.enum` value MUST be mapped in `routes:`, plus the reserved
   abnormal exits `max_iterations` / `budget_exceeded` / `error`.
4. The agent reads context and writes only `output_key`. Tool results return to
   the agent; set `writes_context: true` on a tool only if it should also mutate
   the shared workflow context.
5. For data-driven branching after an outcome (e.g. by country), route into a
   deterministic `Router` with `match:` — NEVER push that logic into the agent:
   ```yaml
   - id: route_by_country
     kind: Router
     match: { field: user.country }
     routes: { US: resolve_us, DE: resolve_eu, default: resolve_other }
   ```
6. **Steering vs skills** — both are per-agent markdown under
   `agents/<workflow>__<stepId>/{steering,skills}/` (scoped to THIS agent, so
   same-named files never collide across agents, and an agent can only read its
   own). `steering` (inline) + `steering_files` are ALWAYS injected (persistent
   operating context); `skills` are injected as capabilities to apply when
   relevant. Missing or out-of-scope paths are skipped at runtime.
7. OPTIONAL supervision — add a `spec.supervisor` block to the workflow to watch
   this agent live and pause / abort / steer it. See the
   `supervise-autonomous-agent` skill.
