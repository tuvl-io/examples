# TUVL Framework Agent Rules

This repository uses the **TUVL framework**, a declarative ASGI router that loads YAML configurations at startup to generate FastAPI routes, PostgreSQL models, and AI agent workflows.

As an AI agent working in this codebase, you must follow these rules strictly to ensure the generated applications are valid and production-ready.

## 1. Declarative First
- Always prefer YAML definitions over writing Python code. Business logic should be expressed as `Workflow` documents with sequences of steps.
- **Never invent fields, step kinds, or document kinds.** Rely only on the specified TUVL vocabulary.
- Allowed Document Kinds: `ModelDefinition`, `Workflow`, `DataSource`, `EmbeddingRegistry`, `CollectionRegistry`, `FederationProvider`, `AgentModel`, `ProjectConfig`, `TelemetryConfig`, `SystemConfig`.

## 2. Directory Structure Conventions
TUVL recursively searches the project directory for YAML files and dispatches them by their `kind:`. Though location doesn't matter strictly, we use these conventions:
- `models/`: Contains `ModelDefinition`, `EmbeddingRegistry`, `CollectionRegistry`.
- `workflows/`: Contains `Workflow` files.
- `datasources/`: Contains `DataSource` configurations.
- `llms/`: Contains `AgentModel` configurations.
- `federation/`: Contains `FederationProvider` configurations.
- `nodes/`: **Must** contain custom Python nodes.

## 3. Python Custom Nodes Rules
When YAML isn't enough, you can create a custom `Functional` Python node.
- **Crucial Rule:** You **MUST** put only one `@node()` decorator per file.
- The Python file name **MUST** exactly match the runner name. E.g., `@node("score_resume")` must be in `nodes/score_resume.py`.
- Do not group multiple nodes into one file.

## 4. Workflow Context Strictness
- `Workflow` triggers receive HTTP request data into a shared `context: dict[str, Any]`.
- **Database Allowlist:** Every model accessed inside a workflow (via `ModelOp` or custom nodes) must be explicitly listed in `spec.context.models`. Missing this causes a `PermissionError`.
- **Reserved Keys:** Do not write to `_session`, `_db`, `_step`, `_response`, `_last_error`, `_last_error_type`, `_api_status_code`, `_context_model_versions`, `_schema_version`, `_instance_id`, `_user_id`.

## 5. Workflow Routing Requirements
- Every step returns a signal (e.g., `default`, `error`, `true`, `false`).
- You **MUST** define explicit mapping for every non-default signal the step might emit in the step's `routes:` map.
- If a signal is emitted that is not in `routes:` (and is not `default`), a `RuntimeError` is raised.

## 5.1 Step Kinds (closed set)
Use only these `kind:` values in workflow steps — never invent others:
`Functional`, `Agent`, `Router`, `APICall`, `MCP`, `ModelOp`, `Response`, `HumanInTheLoop`.
- Every `Agent` step MUST declare a `mode:`. **`mode: completion`** is a single LLM call. **`mode: autonomous`** is a bounded tool-calling loop: the model autonomously picks tools (each `tools[].ref` names another step in the workflow), observes results, and re-decides until done. Map every `outcome.enum` value plus the reserved exits `max_iterations` / `budget_exceeded` / `error` / `aborted` (and `guardrail_violation` when guardrails are attached) in `routes:`.
- `Router` supports a multi-way `match:` switch (`match: { field: user.country }`) for data-driven branching — keep deterministic routing logic here, never push it into an agent.

## 6. PostgreSQL & Multi-tenancy
- Every `ModelDefinition` creates a Postgres table and auto-generates CRUD endpoints.
- Do not emit `tenant_id` fields or RLS (Row Level Security) clauses. The project is single-tenant only.
- PII fields must be marked with `secure: true`.

## 7. Developer Tooling & CLI
- **Running locally:** Use `tuvl dev` (or `uv run tuvl dev`) to start the hot-reloading dev server on `http://localhost:8000`.
- **Auto-Login:** Use `tuvl dev --auto-login` to automatically inject the security key and bypass the Insight developer portal security screen (useful for rapid automated testing).

> For complete syntax and schema details, refer to `docs/TUVL_AGENTIC_MANUAL.md`.
