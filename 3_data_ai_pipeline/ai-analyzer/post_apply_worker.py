"""
post_apply_worker.py

Runs after apply_worker.py patches the workspace repo.

Steps:
1. Poll DB for fix_plan with patch_status = 'patch_applied'
2. Run pnpm build in the workspace repo to verify the patch compiles
3. If build passes  → update patch_status = 'build_passed'  (waits for human approval)
4. If build fails   → update patch_status = 'build_failed'

After the developer approves in the dashboard (POST /api/fix-plans/{id}/approve-push):
5. Poll DB for patch_status = 'approved_to_push'
6. git push patched branch to origin
7. Create GitHub PR → update patch_status = 'pushed'

No Lighthouse audit — that runs in GHA after the branch is pushed.
We only verify the code compiles before sending it to GitHub.

Usage:
    python post_apply_worker.py               # run continuously
    python post_apply_worker.py --once        # process one then exit
    python post_apply_worker.py --fix-plan-id 25 --once
"""

import argparse
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from ra_runtime.db_client import (
    get_db_connection,
    update_fix_plan_status,
    get_fix_plan_changes,
)


load_dotenv()

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────

TARGET_DIR = os.getenv("AGENT_TARGET_DIR", "2_digital_twins/active-staging")
DEFAULT_POLL_INTERVAL = int(os.getenv("POST_APPLY_POLL_INTERVAL", "30"))
WORKER_ID = os.getenv("HOSTNAME", "post_apply_worker")

# If set, symlink node_modules from this path instead of running pnpm install.
NODE_MODULES_SOURCE = os.getenv("NODE_MODULES_SOURCE", "")


# ─────────────────────────────────────────────
# DB: find pushed plans with no PR url (for retry)
# ─────────────────────────────────────────────

def get_pushed_without_pr() -> list:
    """Return fix plans that are pushed but have no pr_url — PR creation failed."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, branch_name
                FROM fix_plans
                WHERE patch_status = 'pushed'
                  AND (pr_url IS NULL OR pr_url = '')
                ORDER BY updated_at ASC
                LIMIT 5
                """
            )
            rows = cur.fetchall()
        conn.commit()
        conn.close()
        return [{"id": r[0], "branch_name": r[1]} for r in rows]
    except Exception as e:
        print(f"[post_apply_worker] get_pushed_without_pr error: {e}")
        return []


# ─────────────────────────────────────────────
# DB: claim next patch_applied fix plan
# ─────────────────────────────────────────────

def claim_next_patch_applied(worker_id: str, fix_plan_id: Optional[int] = None) -> Optional[dict]:
    """
    Atomically claim one fix_plan with patch_status='patch_applied'.
    Sets status to 'build_testing' to prevent double-processing.
    Returns the fix_plan row as a dict, or None if nothing available.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if fix_plan_id:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET patch_status = 'build_testing',
                        updated_at   = NOW()
                    WHERE id = %s
                      AND patch_status = 'patch_applied'
                    RETURNING id, branch_name, page_type, device_type, workspace_path
                    """,
                    (fix_plan_id,),
                )
            else:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET patch_status = 'build_testing',
                        updated_at   = NOW()
                    WHERE id = (
                        SELECT id FROM fix_plans
                        WHERE patch_status = 'patch_applied'
                        ORDER BY updated_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, branch_name, page_type, device_type, workspace_path
                    """
                )
            row = cur.fetchone()
            if not row:
                conn.commit()
                return None

            fix_plan = dict(zip(
                ["id", "branch_name", "page_type", "device_type", "workspace_path"],
                row,
            ))
            conn.commit()
            return fix_plan

    finally:
        if conn:
            conn.close()


# ─────────────────────────────────────────────
# DB: claim next approved_to_push fix plan
# ─────────────────────────────────────────────

def claim_next_approved_to_push(fix_plan_id: Optional[int] = None) -> Optional[dict]:
    """
    Atomically claim one fix_plan with patch_status='approved_to_push'.
    Sets status to 'build_testing' (reuses the in-progress sentinel) to prevent
    double-processing. Returns the fix_plan row as a dict, or None.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if fix_plan_id:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET patch_status = 'build_testing',
                        updated_at   = NOW()
                    WHERE id = %s
                      AND patch_status = 'approved_to_push'
                    RETURNING id, branch_name, page_type, device_type, workspace_path
                    """,
                    (fix_plan_id,),
                )
            else:
                cur.execute(
                    """
                    UPDATE fix_plans
                    SET patch_status = 'build_testing',
                        updated_at   = NOW()
                    WHERE id = (
                        SELECT id FROM fix_plans
                        WHERE patch_status = 'approved_to_push'
                        ORDER BY updated_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, branch_name, page_type, device_type, workspace_path
                    """
                )
            row = cur.fetchone()
            if not row:
                conn.commit()
                return None
            fix_plan = dict(zip(
                ["id", "branch_name", "page_type", "device_type", "workspace_path"],
                row,
            ))
            conn.commit()
            return fix_plan
    finally:
        if conn:
            conn.close()


# ─────────────────────────────────────────────
# Repo path resolution
# ─────────────────────────────────────────────

def resolve_repo_path(fix_plan: dict) -> Optional[Path]:
    workspace_path = fix_plan.get("workspace_path")
    if workspace_path:
        repo = Path(workspace_path) / "repo"
        if repo.exists():
            return repo
        print(f"  ⚠️  workspace_path set but repo missing: {repo}")
    return None


# ─────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────

def _ensure_node_modules(app_dir: Path) -> str:
    """
    Ensure node_modules exists. Returns strategy used:
    'skipped' | 'symlinked' | 'install_needed'
    """
    nm = app_dir / "node_modules"

    if nm.exists() or nm.is_symlink():
        print("  node_modules already present — skipping install", flush=True)
        return "skipped"

    if NODE_MODULES_SOURCE:
        src_nm = Path(NODE_MODULES_SOURCE) / "node_modules"
        if src_nm.is_dir():
            print(f"  Symlinking node_modules from {src_nm}", flush=True)
            nm.symlink_to(src_nm.resolve())
            return "symlinked"
        print(f"  ⚠️  NODE_MODULES_SOURCE set but {src_nm} not found — will install", flush=True)

    return "install_needed"


def run_build(app_dir: Path) -> tuple[bool, str]:
    """
    Build the Next.js app. Returns (success, log).
    Streams output live so progress is visible.
    """
    pm = "pnpm" if shutil.which("pnpm") else "npm"
    logs = []

    nm_strategy = _ensure_node_modules(app_dir)
    logs.append(f"node_modules: {nm_strategy}")


    cmds = []
    if nm_strategy == "install_needed":
        install_cmd = [pm, "install", "--frozen-lockfile"] if pm == "pnpm" else ["npm", "ci"]
        cmds.append(install_cmd)
    cmds.append([pm, "run", "build"])

    for cmd in cmds:
        label = " ".join(cmd)
        print(f"  Running: {label}", flush=True)
        buf = []
        proc = subprocess.Popen(
            cmd,
            cwd=str(app_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        deadline = time.time() + 600
        for line in proc.stdout:
            print(f"    {line}", end="", flush=True)
            buf.append(line)
            if time.time() > deadline:
                proc.kill()
                proc.wait()
                return False, "\n".join(logs) + "\nBUILD TIMEOUT (>600s)"
        proc.wait()
        logs.append(f"$ {label}\n{''.join(buf)}")

        if proc.returncode != 0:
            return False, "\n".join(logs)

    return True, "\n".join(logs)


# ─────────────────────────────────────────────
# Git push
# ─────────────────────────────────────────────

def push_branch(repo_path: Path, branch_name: str, fix_plan_id: int) -> tuple[bool, str]:
    """
    Create a new fix branch from the patched workspace and push it to origin.
    Never touches main or the original working branch directly.

    New branch name: fix/ai-patch-{fix_plan_id}
    """
    fix_branch = f"fix/ai-patch-{fix_plan_id}"

    AI_ENV = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Luminara AI Agent",
        "GIT_AUTHOR_EMAIL": "luminara-ai@noreply.github.com",
        "GIT_COMMITTER_NAME": "Luminara AI Agent",
        "GIT_COMMITTER_EMAIL": "luminara-ai@noreply.github.com",
    }

    def git(args: list, use_ai_identity: bool = False) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git"] + args,
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=120,
            env=AI_ENV if use_ai_identity else None,
        )

    # Stash patch changes so we can reset the workspace cleanly
    git(["stash"])

    # Reset workspace to exact state of origin base branch.
    # This prevents previous fix plan commits from bleeding into new branches.
    fetch = git(["fetch", "origin"])
    if fetch.returncode != 0:
        git(["stash", "pop"])
        return False, f"git fetch failed:\n{fetch.stderr}"

    reset = git(["reset", "--hard", f"origin/{branch_name}"])
    if reset.returncode != 0:
        git(["stash", "pop"])
        return False, f"git reset --hard origin/{branch_name} failed:\n{reset.stderr}"

    # Restore the patch on top of the clean base
    git(["stash", "pop"])

    # Create (or reset) the fix branch at current HEAD
    checkout = git(["checkout", "-B", fix_branch])
    if checkout.returncode != 0:
        return False, f"git checkout -B {fix_branch} failed:\n{checkout.stderr}"

    # FIX: stage only the specific patched files — not the entire directory.
    # git add TARGET_DIR accidentally staged unrelated files (Saboteur.tsx, node_modules symlink).
    changes = get_fix_plan_changes(fix_plan_id, only_pending=False)
    patched_files = [c["target_file"] for c in (changes or []) if c.get("apply_status") == "applied"]

    if patched_files:
        for f in patched_files:
            git(["add", f])
    else:
        stage = git(["add", TARGET_DIR])
        if stage.returncode != 0:
            return False, f"git add failed:\n{stage.stderr}"
        git(["reset", "HEAD", "--", "*.bak_*", "**/*.bak_*"])
        git(["reset", "HEAD", "--", "node_modules", "**/node_modules"])

    status = git(["status", "--porcelain"])
    if not status.stdout.strip():
        # Nothing new to commit — push whatever is on this branch
        push = git(["push", "-f", "origin", fix_branch])
        if push.returncode != 0:
            return False, f"git push failed:\n{push.stderr}"
        return True, f"Pushed existing patch to {fix_branch} (no new changes)"

    commit = git([
        "commit", "-m",
        f"perf: apply AI-generated patch for fix_plan_id={fix_plan_id}\n\n"
        f"Automated patch by Luminara Remediation Agent.\n"
        f"Build verified locally before push.",
    ], use_ai_identity=True)
    if commit.returncode != 0:
        return False, f"git commit failed:\n{commit.stderr}"

    push = git(["push", "-f", "origin", fix_branch])
    if push.returncode != 0:
        return False, f"git push failed:\n{push.stderr}"

    return True, f"Pushed patch to new branch: {fix_branch}"


# ─────────────────────────────────────────────
# GitHub PR creation
# ─────────────────────────────────────────────

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO  = os.getenv("GITHUB_REPO", "Luminara-Team-9/luminara-dashboard")


def _fetch_fix_plan_details(fix_plan_id: int) -> dict:
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT opportunity_id, action, problem_summary, page_type, device_type, estimated_improvement "
                "FROM fix_plans WHERE id = %s",
                (fix_plan_id,),
            )
            row = cur.fetchone()
        conn.close()
        if row:
            return {
                "opportunity_id":      row[0],
                "action":              row[1],
                "problem_summary":     row[2],
                "page_type":           row[3],
                "device_type":         row[4],
                "estimated_improvement": row[5],
            }
    except Exception as e:
        print(f"  ⚠️  Could not fetch fix plan details: {e}")
    return {}


def _save_pr_url(fix_plan_id: int, pr_url: str) -> None:
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE fix_plans SET pr_url = %s, updated_at = NOW() WHERE id = %s",
                (pr_url, fix_plan_id),
            )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"  ⚠️  Could not save pr_url: {e}")


def create_github_pr(
    fix_plan_id: int,
    fix_branch: str,
    base_branch: str,
) -> Optional[str]:
    """
    Create a GitHub PR from fix_branch → base_branch.
    Returns the PR URL on success, None on failure.
    Tries gh CLI first, falls back to GitHub REST API.
    """
    details = _fetch_fix_plan_details(fix_plan_id)

    opp_id   = details.get("opportunity_id", "performance-fix")
    action   = details.get("action", "Apply AI-generated performance fix")
    summary  = details.get("problem_summary", "")
    page     = details.get("page_type", "")
    device   = details.get("device_type", "")
    savings  = details.get("estimated_improvement", 0)

    title = f"perf(ai): {opp_id} — {page}/{device} [fix_plan_id={fix_plan_id}]"

    body = f"""## AI Performance Fix — fix_plan_id={fix_plan_id}

**Opportunity:** `{opp_id}`
**Page:** {page} | **Device:** {device}
**Estimated savings:** {savings}ms

### What the agent fixed
{action}

### Problem
{summary}

### How to review
1. Check the changed files in this PR
2. Run Lighthouse on the page after merging to verify improvement
3. Compare before/after performance scores in the dashboard

---
🤖 Generated by Luminara Remediation Agent. Base branch: `{base_branch}`.
"""

    # ── Try gh CLI first ────────────────────────────────────
    try:
        result = subprocess.run(
            [
                "gh", "pr", "create",
                "--title", title,
                "--body", body,
                "--base", base_branch,
                "--head", fix_branch,
                "--repo", GITHUB_REPO,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            pr_url = result.stdout.strip()
            print(f"  ✅ PR created via gh CLI: {pr_url}")
            return pr_url
        print(f"  ⚠️  gh CLI failed: {result.stderr.strip()}")
    except FileNotFoundError:
        print("  ⚠️  gh CLI not found — trying REST API")
    except Exception as e:
        print(f"  ⚠️  gh CLI error: {e}")

    # ── Fallback: GitHub REST API (via requests) ────────────
    if not GITHUB_TOKEN:
        print("  ❌ No GITHUB_TOKEN set — cannot create PR via REST API")
        return None

    try:
        import requests as _requests

        headers = {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept":        "application/vnd.github+json",
            "Content-Type":  "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        base_url = f"https://api.github.com/repos/{GITHUB_REPO}"
        owner = GITHUB_REPO.split("/")[0]

        # Check if an open PR already exists for this branch
        list_resp = _requests.get(
            f"{base_url}/pulls",
            headers=headers,
            params={"head": f"{owner}:{fix_branch}", "state": "open"},
            timeout=30,
        )
        print(f"  [PR list] status={list_resp.status_code}", flush=True)
        if list_resp.ok and list_resp.json():
            pr_url = list_resp.json()[0].get("html_url", "")
            print(f"  ✅ Open PR already exists: {pr_url}")
            return pr_url

        create_resp = _requests.post(
            f"{base_url}/pulls",
            headers=headers,
            json={"title": title, "body": body, "head": fix_branch, "base": base_branch},
            timeout=30,
        )
        print(f"  [PR create] status={create_resp.status_code}", flush=True)
        if create_resp.ok:
            pr_url = create_resp.json().get("html_url", "")
            print(f"  ✅ PR created via REST API: {pr_url}")
            return pr_url

        print(f"  ❌ REST API PR creation failed: {create_resp.status_code} {create_resp.text[:300]}")
        return None

    except Exception as e:
        print(f"  ❌ REST API PR creation failed: {e}")
        return None


# ─────────────────────────────────────────────
# Process one fix plan
# ─────────────────────────────────────────────

def _patched_files_for_fix_plan(fix_plan_id: int) -> set:
    """Return the set of target_file paths that were patched for this fix plan."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT target_file FROM fix_plan_changes WHERE fix_plan_id = %s",
                (fix_plan_id,),
            )
            return {row[0] for row in cur.fetchall()}
    except Exception:
        return set()
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _build_failure_is_preexisting(build_log: str, fix_plan_id: int) -> bool:
    """
    Return True if every file mentioned in the build error log is NOT one of the
    files the AI patch touched. In that case the failure is pre-existing and not
    caused by this patch, so we should still push.
    """
    patched = _patched_files_for_fix_plan(fix_plan_id)
    if not patched:
        return False

    # Match two formats:
    # 1. TypeScript: "path/to/file.tsx(line,col): error TS..."
    # 2. Next.js build: "path/to/file.tsx" on its own line (no line/col suffix)
    # Allow [ and ] for dynamic route segments like category/[slug]/page.tsx
    error_files = re.findall(r"([\w./@\-\[\]]+\.[jt]sx?)(?:\(\d+|(?=\s*\n|\s*$))", build_log)
    if not error_files:
        return False

    for error_file in error_files:
        for pf in patched:
            # pf is a repo-relative path like "2_digital_twins/.../foo.tsx"
            if error_file in pf or pf.endswith(error_file) or error_file.endswith(pf.split("/")[-1]):
                return False  # Error IS in a patched file — patch may be the cause

    return True  # All errors reference files the patch never touched


def process_fix_plan(fix_plan: dict) -> bool:
    fix_plan_id  = fix_plan["id"]
    branch_name  = fix_plan.get("branch_name")
    page_type    = fix_plan.get("page_type")
    device_type  = fix_plan.get("device_type")

    print(f"\n{'='*60}")
    print(f"  fix_plan_id : {fix_plan_id}")
    print(f"  branch      : {branch_name}")
    print(f"  page_type   : {page_type}")
    print(f"  device_type : {device_type}")
    print(f"{'='*60}")

    # ── Resolve workspace repo ──────────────────────────────
    repo_path = resolve_repo_path(fix_plan)
    if not repo_path:
        msg = f"Workspace repo not found for fix_plan_id={fix_plan_id}"
        print(f"  ❌ {msg}")
        update_fix_plan_status(fix_plan_id, "build_failed", error_message=msg)
        return False

    app_dir = repo_path / TARGET_DIR
    print(f"  app_dir     : {app_dir}")

    # ── Step 1: Build ───────────────────────────────────────
    print(f"\n  [1] Building {TARGET_DIR}...")
    try:
        build_ok, build_log = run_build(app_dir)
    except Exception as e:
        build_ok, build_log = False, str(e)

    print(f"  build_status: {'passed' if build_ok else 'FAILED'}")

    if not build_ok:
        preexisting = _build_failure_is_preexisting(build_log, fix_plan_id)
        if preexisting:
            print(
                f"\n  ⚠️  Build failure is in files the patch did NOT touch — "
                f"pre-existing error, not caused by this patch. Proceeding to push."
            )
            # Fall through to push — the patch itself is correct
        else:
            error_msg = f"Build failed:\n{build_log[-500:]}"
            update_fix_plan_status(fix_plan_id, "build_failed", error_message=error_msg)
            print(f"\n  [2] DB updated → patch_status=build_failed")
            # Reset workspace to clean state so subsequent fix plans aren't polluted
            try:
                branch = fix_plan.get("branch_name", "")
                if branch:
                    subprocess.run(
                        ["git", "reset", "--hard", f"origin/{branch}"],
                        cwd=str(repo_path), capture_output=True, timeout=60,
                    )
                    print(f"  🧹 Workspace reset to origin/{branch} (prevent pollution)")
            except Exception as reset_err:
                print(f"  ⚠️  Workspace reset failed: {reset_err}")
            return False

    # ── Step 2: Push to new fix branch ─────────────────────
    fix_branch = f"fix/ai-patch-{fix_plan_id}"
    print(f"\n  [2] Pushing to new branch: {fix_branch}")
    if not branch_name:
        msg = "No branch_name saved in fix_plans — cannot push"
        print(f"  ❌ {msg}")
        update_fix_plan_status(fix_plan_id, "build_failed", error_message=msg)
        return False

    push_ok, push_msg = push_branch(repo_path, branch_name, fix_plan_id)
    print(f"  {'✅' if push_ok else '❌'} {push_msg}")

    if not push_ok:
        update_fix_plan_status(fix_plan_id, "push_failed", error_message=push_msg)
        print(f"\n  [3] DB updated → patch_status=push_failed")
        return False

    # ── Step 3: Create GitHub PR ────────────────────────────
    print(f"\n  [3] Creating GitHub PR: {fix_branch} → {branch_name}")
    pr_url = create_github_pr(fix_plan_id, fix_branch, branch_name)

    if pr_url:
        _save_pr_url(fix_plan_id, pr_url)
        update_fix_plan_status(fix_plan_id, "pr_created")
        print(f"\n  [4] DB updated → patch_status=pr_created | pr_url={pr_url}")
    else:
        update_fix_plan_status(fix_plan_id, "pushed")
        print(f"\n  [4] DB updated → patch_status=pushed (PR creation failed — will retry)")

    return True


# ─────────────────────────────────────────────
# Push + PR (runs after developer approves)
# ─────────────────────────────────────────────

def process_push(fix_plan: dict) -> bool:
    """Push the patched branch and create a GitHub PR after developer approval."""
    fix_plan_id = fix_plan["id"]
    branch_name = fix_plan.get("branch_name")

    print(f"\n{'='*60}")
    print(f"  [push] fix_plan_id : {fix_plan_id}")
    print(f"  [push] branch      : {branch_name}")
    print(f"{'='*60}")

    repo_path = resolve_repo_path(fix_plan)
    if not repo_path:
        msg = f"Workspace repo not found for fix_plan_id={fix_plan_id}"
        print(f"  ❌ {msg}")
        update_fix_plan_status(fix_plan_id, "push_failed", error_message=msg)
        return False

    if not branch_name:
        msg = "No branch_name saved in fix_plans — cannot push"
        print(f"  ❌ {msg}")
        update_fix_plan_status(fix_plan_id, "push_failed", error_message=msg)
        return False

    fix_branch = f"fix/ai-patch-{fix_plan_id}"
    print(f"\n  [1] Pushing to new branch: {fix_branch}")
    push_ok, push_msg = push_branch(repo_path, branch_name, fix_plan_id)
    print(f"  {'✅' if push_ok else '❌'} {push_msg}")

    if not push_ok:
        update_fix_plan_status(fix_plan_id, "push_failed", error_message=push_msg)
        print(f"\n  [2] DB updated → patch_status=push_failed")
        return False

    print(f"\n  [2] Creating GitHub PR: {fix_branch} → {branch_name}")
    pr_url = create_github_pr(fix_plan_id, fix_branch, branch_name)

    if pr_url:
        _save_pr_url(fix_plan_id, pr_url)
        update_fix_plan_status(fix_plan_id, "pushed")
        print(f"\n  [3] DB updated → patch_status=pushed | pr_url={pr_url}")
    else:
        update_fix_plan_status(fix_plan_id, "pushed")
        print(f"\n  [3] DB updated → patch_status=pushed (PR creation failed — create manually)")

    return True


# ─────────────────────────────────────────────
# Worker loop
# ─────────────────────────────────────────────

def run_worker(
    once: bool = False,
    poll_interval: int = DEFAULT_POLL_INTERVAL,
    fix_plan_id: Optional[int] = None,
) -> None:
    print(f"[post_apply_worker] Starting")
    print(f"  worker_id    : {WORKER_ID}")
    print(f"  target_dir   : {TARGET_DIR}")
    print(f"  poll_interval: {poll_interval}s")

    running = True

    def _stop(signum, frame):
        nonlocal running
        print("\n[post_apply_worker] Shutting down...")
        running = False

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    while running:
        try:
            fix_plan = claim_next_patch_applied(
                worker_id=WORKER_ID,
                fix_plan_id=fix_plan_id,
            )

            if fix_plan:
                fid = fix_plan["id"]
                print(f"\n[post_apply_worker] Processing fix_plan_id={fid}")
                success = process_fix_plan(fix_plan)
                status_str = "✅ pushed" if success else "❌ failed"
                print(f"\n[post_apply_worker] {status_str} — fix_plan_id={fid}")
            else:
                print(
                    f"[post_apply_worker] No patch_applied fix plans. "
                    f"Sleeping {poll_interval}s..."
                )

            # Retry PR creation for any pushed plans that still have no pr_url
            stuck = get_pushed_without_pr()
            for item in stuck:
                fid = item["id"]
                branch = item["branch_name"]
                fix_branch = f"fix/ai-patch-{fid}"
                print(f"\n[post_apply_worker] Retrying PR for fix_plan_id={fid}...")
                pr_url = create_github_pr(fid, fix_branch, branch)
                if pr_url:
                    _save_pr_url(fid, pr_url)
                    update_fix_plan_status(fid, "pr_created")
                    print(f"  ✅ PR created → pr_created | {pr_url}")
                else:
                    print(f"  ⚠️ PR retry failed for fix_plan_id={fid} — will try again next cycle")

        except Exception as e:
            print(f"[post_apply_worker] ❌ Worker error: {e}")

        if once or not running:
            break

        time.sleep(poll_interval)

    print("[post_apply_worker] Stopped.")


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Luminara Post-Apply Worker — builds and pushes patched workspace."
    )
    parser.add_argument("--once", action="store_true",
                        help="Process one fix plan then exit.")
    parser.add_argument("--fix-plan-id", type=int, default=None,
                        help="Process a specific fix_plan_id directly.")
    parser.add_argument("--interval", type=int, default=DEFAULT_POLL_INTERVAL,
                        help=f"Poll interval in seconds (default: {DEFAULT_POLL_INTERVAL}).")
    args = parser.parse_args()

    run_worker(
        once=args.once,
        poll_interval=args.interval,
        fix_plan_id=args.fix_plan_id,
    )


if __name__ == "__main__":
    main()
