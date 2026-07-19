# supervise-autonomous-agent
description: Add a per-workflow supervisor that watches autonomous Agent runs and can pause/abort/steer them.
options:
  argument-hint: "[workflow-name]"

### Body

1. A supervisor is authored **in-band** (one optional `spec.supervisor` block per
   workflow) but runs **out-of-band** — the engine spawns a concurrent watcher for
   each autonomous-mode `Agent` run that subscribes to its live progress and issues
   cooperative control directives at the next iteration boundary (never mid-call).
2. Add it under `spec:` (a sibling of `steps:`), NOT as a step:
   ```yaml
   spec:
     # context / trigger / steps ...
     supervisor:
       model: default              # omit → rule-only; set → LLM supervisor
       watches: [agents]           # default; monitors autonomous Agent iterations
       criteria: |                 # NL policy for the LLM path
         Abort if the agent calls the same tool 3x with no new information,
         or drifts away from the user's actual request.
       # criteria: artifact://supervisor-policy@1
       #                           ↑ steering-artifact alternative to inline text
       on_violation: pause         # abort | pause | steer   (default action)
       every_n_iterations: 2       # LLM cost gate (rules run every turn)
       steer_message: Refocus on the task; stop repeating actions.  # rules-path steer text
       rules:                      # cheap deterministic pre-filters (no LLM)
         - { when: tool_repeated, count: 3, then: pause }
         - { when: budget_fraction, gt: 0.8, then: steer }
         - { when: iteration_reached, gte: 12, then: abort }
   ```
3. **Rules** (deterministic, every turn, free): `tool_repeated {tool?, count}`,
   `budget_fraction {gt}`, `iteration_reached {gte}`. **LLM criteria** (needs
   `model` + `criteria`) runs every `every_n_iterations` and, on a fail verdict,
   applies `on_violation` with the reason surfaced (and used as the steer message).
4. **Policy as an artifact** — instead of inline `criteria` text, reference a
   `type: steering` prose artifact from the project's `artifacts/` directory
   (`criteria: artifact://<name>@<version>`; pin the version). `steer_message`
   sets the text injected on a `steer` from a **rule** (the LLM path steers with
   its reason).
5. `abort` exits the agent through the reserved `"aborted"` signal — map it in the
   step's `routes:` if you want a specific downstream path (else it routes as an
   error). `pause`/`steer` keep the run alive.
6. **In Insight** you can skip the YAML: add the off-spine **Supervisor** node from
   the palette (one per workflow), double-click to set the model (dropdown of
   configured models), criteria (inline or an artifact reference), `on_violation`,
   `every_n_iterations`, and rules — all written straight into `spec.supervisor`.
7. Operators can also observe + control runs live at `GET /api/agents/runs` and
   `POST /api/agents/runs/{id}/{abort,pause,resume,steer}` (scopes
   `agent:observe` / `agent:control`), or from the Insight **Agents** dashboard.
8. Supervision is optional and additive: no `spec.supervisor` means no watcher and
   zero cost.
