"""
post_apply_worker.py

Runs after apply_worker.py patches the workspace repo.

Steps:
1. Poll DB for fix_plan with patch_status = 'patch_applied'
2. Run pnpm build in the workspace repo to verify the patch compiles
3. If build passes  → git push patched branch to origin
                    → update patch_status = 'pushed'
4. If build fails   → update patch_status = 'build_failed'

No Lighthouse audit — that runs in GHA after the branch is pushed.
We only verify the code compiles before sending it to GitHub.

Usage:
    python post_apply_worker.py               # run continuously
    python post_apply_worker.py --once        # process one then exit
    python post_apply_worker.py --fix-plan-id 25 --once
"""

import argparse
import os
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

    def git(args: list) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git"] + args,
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=120,
        )

    # Stash patch changes so git pull --rebase doesn't refuse
    git(["stash"])

    # Sync workspace with latest remote base branch first
    pull = git(["pull", "--rebase", "origin", branch_name])
    if pull.returncode != 0:
        git(["stash", "pop"])
        return False, f"git pull --rebase failed:\n{pull.stderr}"

    # Restore the patch
    git(["stash", "pop"])

    # Create (or reset) the fix branch at current HEAD
    checkout = git(["checkout", "-B", fix_branch])
    if checkout.returncode != 0:
        return False, f"git checkout -B {fix_branch} failed:\n{checkout.stderr}"

    # Stage only the patched app directory
    stage = git(["add", TARGET_DIR])
    if stage.returncode != 0:
        return False, f"git add failed:\n{stage.stderr}"

    # Unstage any .bak_* backup files created by apply_patch.py
    git(["reset", "HEAD", "--", "*.bak_*", "**/*.bak_*"])

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
    ])
    if commit.returncode != 0:
        return False, f"git commit failed:\n{commit.stderr}"

    push = git(["push", "-f", "origin", fix_branch])
    if push.returncode != 0:
        return False, f"git push failed:\n{push.stderr}"

    return True, f"Pushed patch to new branch: {fix_branch}"


# ─────────────────────────────────────────────
# Process one fix plan
# ─────────────────────────────────────────────

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
        error_msg = f"Build failed:\n{build_log[-500:]}"
        update_fix_plan_status(fix_plan_id, "build_failed", error_message=error_msg)
        print(f"\n  [2] DB updated → patch_status=build_failed")
        return False

    # ── Step 2: Push to new fix branch ─────────────────────────────────
    fix_branch = f"fix/ai-patch-{fix_plan_id}"
    print(f"\n  [2] Pushing to new branch: {fix_branch}")
    if not branch_name:
        msg = "No branch_name saved in fix_plans — cannot push"
        print(f"  ❌ {msg}")
        update_fix_plan_status(fix_plan_id, "build_failed", error_message=msg)
        return False

    push_ok, push_msg = push_branch(repo_path, branch_name, fix_plan_id)
    print(f"  {'✅' if push_ok else '❌'} {push_msg}")

    final_status = "pushed" if push_ok else "push_failed"
    error_msg = None if push_ok else push_msg
    update_fix_plan_status(fix_plan_id, final_status, error_message=error_msg)
    print(f"\n  [3] DB updated → patch_status={final_status}")

    return push_ok


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
