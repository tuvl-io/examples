---
name: agent-tool
description: "Implement a tool agent: db (model operations), http (external API) or mcp (one MCP tool), with effects, idempotency and compensation."
---
# Tool agents (no Python)

```yaml
- id: persist
  engine: tool
  inputs: { subject: str, body: str }
  outputs: { ticket: Ticket }          # db results land in the single output
  tool:
    use: db
    model: Ticket
    op: create                         # read | list | create | update | upsert | delete
    values: { subject: "{{ subject }}", body: "{{ body }}" }
  compensate: discard_ticket           # off-spine agent that undoes it on a rollback end
  routes: { default: END, conflict: END.failed, error: END.failed }
```
- `where` values are converted to the column's type (a uuid string matches a `uuid` column); type
  the inputs that feed them to match the model (`order_id: uuid`).
- `read`/`delete` require a `not_found` route; `create`/`update`/`upsert` a `conflict` route.
- http: `tool: { use: http, method: POST, url: "${ENV:default}", body: {...}, map: { out: response.body.x }, idempotency: auto }`.
  POST/PUT/PATCH/DELETE are writes unless you declare `effect: read` on the agent. Route `http_4xx`
  signals as needed; outages go to `error` — route them somewhere safe.
- mcp: `tool: { use: mcp, server: artifact://fetch-web@1, name: fetch, args: { url: "{{ url }}" } }`;
  the server is a `type: mcp` artifact. Pin it in `tuvl lock`.
- Templates use TEL over the agent's inputs only. Run `tuvl validate` — it type-checks every flow.
- Tests: `db` tools run offline against the test database; `http`/`mcp` must be mocked.
