---
name: tuvl-ship
description: "Prepare a tuvl project for production: lock, the CI gate, tuvl ship and the extras an image installs."
---
# Shipping

1. `tuvl generate lock` — pins the tuvl version, model ids, artifact hashes, judges and MCP tool schemas.
   Commit `tuvl.lock`.
2. The CI gate (all must pass):
   ```bash
   tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict
   ```
3. `tuvl ship [--no-image] [--format image|archive|both] [--push] [--extra NAME] [--force] [--allow-incomplete] [--allow-dirty]` validates, refuses a missing or stale lock
   (V024), writes `deploy/Dockerfile` and a Helm chart, then builds the image.

## What the image installs
`tuvl` itself is lean. These features are extras, and `tuvl ship` installs only the ones the project uses:

| Extra | Installed when |
|---|---|
| `mcp` | a `use: mcp` tool, a loop MCP server, or a workflow with `trigger.mcp.enabled` |
| `redis` | a `kind: DataSource` with `type: redis`, or `agents/*.py` imports `redis` |
| `vector` | a Collection or Embedding document, `tuvl.data_search`/`tuvl.data_ingest`, or an import of `pgvector` |
| `otel-grpc` | `.tuvl/telemetry.yaml` sets `otlp_protocol: grpc` |

`codegen` and `test` are development extras and never reach an image. Providers, storage (S3, Azure, GCS)
and every model provider need no extra.
- `tuvl ship` prints the extras it chose and why, and records them as the image label `io.tuvl.extras`.
  If a feature is turned on in a way the scan cannot see (for example by an environment variable), pass
  `--extra NAME`.
- It stops when `agents/*.py` imports a package `pyproject.toml` does not declare: `uv add <package>`.
  Declared packages that no agent imports are listed, not removed.
- A kept `deploy/Dockerfile` that lacks an extra the project now needs stops the ship: use `--force`
  (a changed `values.yaml` and chart are kept unless forced too).
- A feature used without its extra fails with `pip install 'tuvl[name]'`; `tuvl[standard]` installs all
  of them plus Insight for development.

## Production rules
- Production refuses dev keys and needs a real signing key (`TUVL_SIGNING_KEY`, from `tuvl generate key`); triggers require a token unless
  `trigger.http.public: true`.
- No `pending` agents may remain (V010) — `tuvl list tasks` shows them as `todo`.
- Local-disk storage stores get a volume in the chart; cloud stores need none.
- A workflow naming a disabled or undefined model is refused with the reason (HTTP 409), not run.
- `tuvl deploy` (managed hosting) is not available yet: it only prints a message and exits 1. Deploy the
  chart that ship writes with `helm`.
