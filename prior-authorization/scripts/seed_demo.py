"""Seed a running prior-authorization project with a demo policy, synthetic evidence and three demo users.

Standard library only. Idempotent: run it again and nothing is duplicated.

    python scripts/seed_demo.py --url http://localhost:8897          # reads the dev key from .tuvl/.dev-session
    python scripts/seed_demo.py --url https://host --token <iam:admin token>

All data is synthetic. The demo users exist so the screens show three different people:
an intake reviewer, a clinical reviewer, and a policy administrator.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PASSWORD = "demo-pass-1"  # demo only: these users exist in a throwaway sandbox
ROLES = {
    "reviewers": ["reviewers", "evidence:read", "evaluation:read", "policyversion:read"],
    "clinical_reviewers": ["reviewers", "approvals:decide", "evidence:read", "evaluation:read", "policyversion:read", "runs:read"],
    "policy_admins": ["policy_admins", "reviewers", "evidence:read", "evidence:write", "evidence:delete", "evaluation:read", "policyversion:read", "runs:read"],
}
USERS = [
    ("intake@demo.test", "Ines", "Intake", ["reviewers"]),
    ("dr.chen@demo.test", "Dr. Mei", "Chen", ["clinical_reviewers"]),
    ("policy@demo.test", "Priya", "Policy", ["policy_admins"]),
]
POLICY = {
    "procedure_code": "MRI-LUMBAR",
    "version": "1",
    "source_ref": "demo-seed",
    "criteria": [
        {"id": "R1", "kind": "diagnosis_in", "value": ["M54.5", "M51.16", "M51.26"], "severity": "block"},
        {"id": "R2", "kind": "attr_min", "evidence_kind": "therapy_record", "attr": "duration_days",
         "value": 42, "severity": "block"},
        {"id": "R3", "kind": "has_evidence", "evidence_kind": "clinical_note", "severity": "warn"},
    ],
}
NOTE = {"kind": "clinical_note", "recorded_on": "2026-01-11", "summary": "Synthetic: lower back pain, exam documented"}


def therapy(days: int) -> dict:
    return {"kind": "therapy_record", "recorded_on": "2026-01-12", "summary": f"Synthetic: {days} days of physiotherapy",
            "attributes": {"duration_days": days}}


EVIDENCE = {
    "SYN-1001": [NOTE, therapy(56)],  # meets every rule
    "SYN-1002": [therapy(56)],  # no clinical note
    "SYN-1003": [NOTE, therapy(14)],  # too little therapy
    "SYN-1004": [NOTE],  # no therapy record
}


class Api:
    def __init__(self, base: str, token: str) -> None:
        self.base, self.token = base.rstrip("/"), token

    def call(self, method: str, path: str, body=None, ok=(200, 201)):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                return err.code, json.loads(raw)
            except ValueError:
                return err.code, raw.decode(errors="replace")


def wait_ready(base: str, seconds: int = 90) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base.rstrip("/") + "/health", timeout=3):
                return
        except Exception:
            time.sleep(1)
    sys.exit(f"{base} did not become ready")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--token", help="an iam:admin token; default: the dev key in .tuvl/.dev-session")
    ap.add_argument("--project-dir", default=str(Path(__file__).resolve().parent.parent))
    args = ap.parse_args()
    wait_ready(args.url)
    token = args.token
    if not token:
        session = Path(args.project_dir) / ".tuvl" / ".dev-session"
        for _ in range(60):  # the dev server writes it a moment after it starts
            if session.exists():
                break
            time.sleep(1)
        token = json.loads(session.read_text())["key"]
    api = Api(args.url, token)

    _, roles = api.call("GET", "/auth/admin/roles")
    by_name = {r["name"]: r for r in roles or []}
    for name, scopes in ROLES.items():
        if name not in by_name:
            code, role = api.call("POST", "/auth/admin/roles", {"name": name, "scopes": scopes})
            if code not in (200, 201):
                sys.exit(f"role {name}: {code} {role}")
            by_name[name] = role
        else:
            api.call("PATCH", f"/auth/admin/roles/{by_name[name]['id']}/scopes", {"scopes": scopes})
    _, users = api.call("GET", "/auth/admin/users")
    have = {u["email"] for u in users or []}
    for email, first, last, role_names in USERS:
        if email not in have:
            code, user = api.call("POST", "/auth/admin/users",
                                  {"email": email, "first_name": first, "last_name": last, "password": PASSWORD})
            if code not in (200, 201):
                sys.exit(f"user {email}: {code} {user}")
            for role in role_names:
                api.call("POST", f"/auth/admin/users/{user['id']}/roles/{by_name[role]['id']}")
    print(f"users ready (password for all: {PASSWORD})")

    code, active = api.call("GET", "/models/policyversion/?filter[procedure_code]=MRI-LUMBAR&filter[status]=active")
    if code != 200 or not isinstance(active, list):
        sys.exit(f"policy list: {code} {active}")
    if not active:
        code, body = api.call("POST", "/policies", POLICY)
        if code != 201:
            sys.exit(f"policy: {code} {body}")
    print("policy ready")

    code, existing = api.call("GET", "/models/evidence/?limit=1")
    if code != 200 or not isinstance(existing, list):
        sys.exit(f"evidence list: {code} {existing}")
    if not existing:  # member_ref is a secure field and cannot be filtered on, so seed only an empty table
        for member, items in EVIDENCE.items():
            for item in items:
                code, body = api.call("POST", "/models/evidence/", {"member_ref": member, **item})
                if code not in (200, 201):
                    sys.exit(f"evidence {member}: {code} {body}")
    print("evidence ready")


if __name__ == "__main__":
    main()
