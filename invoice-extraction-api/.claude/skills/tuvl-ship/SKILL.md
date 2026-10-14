---
name: tuvl-ship
description: "Prepare a tuvl project for production: lock, the CI gate, tuvl ship."
---
# Shipping

1. `tuvl lock` — pins the tuvl version, model ids, artifact hashes, judges and MCP tool schemas.
   Commit `tuvl.lock`.
2. The CI gate (all must pass):
   ```bash
   tuvl spec check && tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test --strict && tuvl spec verify --strict && tuvl spec status --strict
   ```
3. `tuvl ship [--no-build] [--push]` validates, refuses a missing or stale lock (V024), writes
   `deploy/Dockerfile` (installs exactly the locked tuvl) and a Helm chart, then builds the image.
- Production refuses dev keys and needs a real signing key (`TUVL_SIGNING_KEY`, from `tuvl keys generate`); triggers require a token unless
  `trigger.http.public: true`.
- No `pending` agents may remain (V010) — `tuvl spec status` shows them as `todo`.
