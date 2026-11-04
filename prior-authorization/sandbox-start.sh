#!/bin/sh
# Sandbox entrypoint (see ../Dockerfile.dev): serves the screens on :8001 under the portal's /ui/, seeds the demo
# policy, evidence and users once the engine is up, then runs the dev server on :8000 as every other example does.
python -m http.server 8001 --directory ui >/dev/null 2>&1 &
python scripts/seed_demo.py --url http://127.0.0.1:8000 >/tmp/seed.log 2>&1 &
exec tuvl dev --project-dir . --port 8000 --no-browser --allow-host 0.0.0.0/0 --auto-login
