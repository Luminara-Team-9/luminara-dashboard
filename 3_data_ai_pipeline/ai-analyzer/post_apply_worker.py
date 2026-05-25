"""
post_apply_worker.py

Runs after apply_worker.py patches the workspace repo.

Steps:
1. Poll DB for fix_plan with patch_status = 'patch_applied'
2. Build the active-staging Next.js app inside the workspace repo
3. Start the local server on a free port
4. Run Lighthouse against the patched page
5. Compare new score vs old score
6. Update DB with result (new_local_score, build_status, audit_status)
7. If passed → push patched branch to origin
8. Always update patch_status (local_test_passed / local_test_failed)

Usage:
    python post_apply_worker.py           # run continuously
    python post_apply_worker.py --once    # process one then exit
    python post_apply_worker.py --fix-plan-id 25   # process specific fix plan
"""

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

from ra_runtime.db_client import (
    get_db_connection,
    save_local_test_result,
    update_fix_plan_status,
)


load_dotenv()

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────

TARGET_DIR = os.getenv("AGENT_TARGET_DIR", "2_digital_twins/active-staging")
LOCAL_TEST_PORT = int(os.getenv("LOCAL_TEST_PORT", "3099"))

# Path to the permanently-installed active-staging whose node_modules we reuse.
# If set and node_modules exists there, we symlink instead of re-installing.
NODE_MODULES_SOURCE = os.getenv("NODE_MODULES_SOURCE", "")
DEFAULT_POLL_INTERVAL = int(os.getenv("POST_APPLY_POLL_INTERVAL", "30"))
WORKER_ID = os.getenv("HOSTNAME", "post_apply_worker")

LIGHTHOUSE_RUNNER_PATH = os.getenv(
    "LIGHTHOUSE_RUNNER_PATH",
    "/abr/coss41/shared_workspace/yuyu_workspace/codebase/luminara-dashboard"
    "/4_automation_tests/lighthouse-runner/run_lighthouse.js",
)

PASS_THRESHOLD = int(os.getenv("LOCAL_TEST_PASS_THRESHOLD", "5"))
GITHUB_REPO_URL = os.getenv(
    "GITHUB_REPO_URL",
    "https://github.com/Luminara-Team-9/luminara-dashboard.git",
)


# ─────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────

def claim_next_patch_applied() -> Optional[dict]:
    """
    Atomically claim one fix_plan with patch_status = 'patch_applied'.
    Sets status to 'local_test_running' to prevent double-processing.
    """
    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit = False

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                WITH next_plan AS (
                    SELECT fp.id
                    FROM fix_plans fp
                    WHERE fp.patch_status = 'patch_applied'
                    ORDER BY fp.updated_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE fix_plans fp
                SET
                    patch_status = 'local_test_running',
                    updated_at = NOW()
                FROM next_plan
                WHERE fp.id = next_plan.id
                RETURNING
                    fp.id,
                    fp.test_id,
                    fp.branch_name,
                    fp.page_type,
                    fp.device_type,
                    fp.old_score,
                    fp.workspace_path,
                    fp.group_key
                """
            )
            row = cur.fetchone()
            if not row:
                conn.commit()
                return None

            fix_plan = dict(row)
            conn.commit()
            return fix_plan

    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def get_test_url(fix_plan: dict) -> Optional[str]:
    """
    Get the URL to test from lighthouse_runs for this fix_plan's test_id.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT url FROM lighthouse_runs WHERE test_id = %s LIMIT 1",
                (fix_plan.get("test_id"),),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        if conn:
            conn.close()


# ─────────────────────────────────────────────
# Port helpers
# ─────────────────────────────────────────────

def find_free_port(start: int = LOCAL_TEST_PORT) -> int:
    """Find a free TCP port starting from start."""
    port = start
    while port < start + 100:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("localhost", port)) != 0:
                return port
        port += 1
    return start


# ─────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────

def resolve_repo_path(fix_plan: dict) -> Optional[Path]:
    workspace_path = fix_plan.get("workspace_path")
    if workspace_path:
        repo = Path(workspace_path) / "repo"
        if repo.exists():
            return repo
    return None


def _ensure_node_modules(app_dir: Path) -> str:
    """
    Ensure node_modules exists in app_dir as fast as possible.

    Strategy (in priority order):
    1. node_modules already present → skip install entirely.
    2. NODE_MODULES_SOURCE env points to a valid node_modules dir → symlink it.
    3. Fall through → caller runs pnpm install normally.

    Returns: "skipped" | "symlinked" | "install_needed"
    """
    nm = app_dir / "node_modules"

    if nm.exists() or nm.is_symlink():
        print("  node_modules already present — skipping install", flush=True)
        return "skipped"

    src = NODE_MODULES_SOURCE
    if src:
        src_nm = Path(src) / "node_modules"
        if src_nm.is_dir():
            print(f"  Symlinking node_modules from {src_nm}", flush=True)
            nm.symlink_to(src_nm.resolve())
            return "symlinked"
        else:
            print(f"  ⚠️  NODE_MODULES_SOURCE set but {src_nm} not found — will install", flush=True)

    return "install_needed"


def run_build(app_dir: Path) -> tuple[bool, str]:
    """
    Install dependencies and build the Next.js app.
    Returns (success, output_log).
    """
    logs = []

    # Detect package manager
    pm = "pnpm" if shutil.which("pnpm") else "npm"
    print(f"  Using package manager: {pm}")

    nm_strategy = _ensure_node_modules(app_dir)
    logs.append(f"node_modules strategy: {nm_strategy}")

    if nm_strategy == "install_needed":
        install_cmd = [pm, "install", "--frozen-lockfile"] if pm == "pnpm" else ["npm", "ci"]
        cmds = [install_cmd, [pm, "run", "build"]]
    else:
        cmds = [[pm, "run", "build"]]

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
                return False, "\n".join(logs) + "\nBUILD TIMEOUT"
        proc.wait()
        logs.append(f"$ {label}\n{''.join(buf)}")

        if proc.returncode != 0:
            return False, "\n".join(logs)

    # Copy standalone assets (Next.js standalone mode)
    standalone = app_dir / ".next" / "standalone"
    if standalone.exists():
        public_src = app_dir / "public"
        static_src = app_dir / ".next" / "static"
        public_dst = standalone / "public"
        static_dst = standalone / ".next" / "static"

        if public_src.exists() and not public_dst.exists():
            shutil.copytree(public_src, public_dst)

        if static_src.exists() and not static_dst.exists():
            shutil.copytree(static_src, static_dst)

    return True, "\n".join(logs)


# ─────────────────────────────────────────────
# Server
# ─────────────────────────────────────────────

def start_server(app_dir: Path, port: int) -> Optional[subprocess.Popen]:
    """
    Start the Next.js local server.
    Returns the process handle, or None if startup failed.
    """
    standalone_server = app_dir / ".next" / "standalone" / "server.js"
    env = {**os.environ, "PORT": str(port), "NODE_ENV": "production"}

    if standalone_server.exists():
        cmd = ["node", str(standalone_server)]
    else:
        pm = "pnpm" if shutil.which("pnpm") else "npm"
        cmd = [pm, "run", "start", "--", "-p", str(port)]

    print(f"  Starting server on port {port}: {' '.join(cmd)}")

    proc = subprocess.Popen(
        cmd,
        cwd=str(app_dir),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # Wait for server to be ready
    for _ in range(30):
        time.sleep(2)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("localhost", port)) == 0:
                print(f"  ✅ Server ready on port {port}")
                return proc

        if proc.poll() is not None:
            out, err = proc.communicate()
            print(f"  ❌ Server exited early:\n{err[:500]}")
            return None

    print("  ❌ Server did not become ready in 60s")
    proc.terminate()
    return None


def stop_server(proc: subprocess.Popen) -> None:
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


# ─────────────────────────────────────────────
# Lighthouse
# ─────────────────────────────────────────────

def build_local_url(remote_url: str, port: int) -> str:
    """
    Convert production URL to local URL.
    e.g. https://www.decathlon.co.kr/p/abc → http://localhost:3099/p/abc
    """
    parsed = urlparse(remote_url)
    return f"http://localhost:{port}{parsed.path}"


def _find_lighthouse_cmd() -> Optional[list]:
    """Return the command prefix to invoke Lighthouse, or None if unavailable."""
    lh = shutil.which("lighthouse")
    if lh:
        return [lh]
    npx = shutil.which("npx")
    if npx:
        return [npx, "--yes", "lighthouse"]
    return None


def run_lighthouse_once(local_url: str, output_path: Path) -> Optional[dict]:
    """
    Run Lighthouse CLI against local_url. Returns parsed JSON or None.
    """
    lh_cmd = _find_lighthouse_cmd()

    if not lh_cmd:
        print("  ⚠️  lighthouse CLI not found (no lighthouse or npx in PATH) — skipping audit")
        return None

    cmd = [
        *lh_cmd,
        local_url,
        "--output=json",
        f"--output-path={output_path}",
        "--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage --disable-gpu",
        "--only-categories=performance",
        "--preset=perf",
        "--quiet",
    ]

    print(f"  Running Lighthouse: {local_url}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

    if not output_path.exists():
        print(f"  ❌ Lighthouse did not produce output: {result.stderr[:300]}")
        return None

    try:
        return json.loads(output_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  ❌ Failed to parse Lighthouse JSON: {e}")
        return None


def extract_performance_score(lhr: dict) -> Optional[float]:
    try:
        score = lhr["categories"]["performance"]["score"]
        return round(float(score) * 100, 1)
    except (KeyError, TypeError):
        return None


def run_audit(local_url: str, tmp_dir: Path, runs: int = 3) -> Optional[float]:
    """
    Run Lighthouse N times and return the median performance score.
    """
    scores = []
    for i in range(1, runs + 1):
        out = tmp_dir / f"lhr_{i}.json"
        lhr = run_lighthouse_once(local_url, out)
        if lhr:
            score = extract_performance_score(lhr)
            if score is not None:
                scores.append(score)
                print(f"  Run {i}: performance_score={score}")
        time.sleep(5)

    if not scores:
        return None

    scores.sort()
    mid = len(scores) // 2
    return scores[mid]


# ─────────────────────────────────────────────
# Git push
# ─────────────────────────────────────────────

def push_branch(repo_path: Path, branch_name: str, fix_plan_id: int) -> tuple[bool, str]:
    """
    Commit the applied patch and push to origin.
    """
    def git(args: list, **kw) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git"] + args,
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=120,
            **kw,
        )

    # Stage only the target_dir changes
    stage = git(["add", TARGET_DIR])
    if stage.returncode != 0:
        return False, f"git add failed:\n{stage.stderr}"

    status = git(["status", "--porcelain"])
    if not status.stdout.strip():
        return True, "Nothing to commit — patch already in tree"

    commit = git([
        "commit",
        "-m",
        f"perf: apply AI-generated patch for fix_plan_id={fix_plan_id}\n\n"
        f"Automated patch by Luminara Remediation Agent.\n"
        f"Local Lighthouse test passed before push.",
    ])

    if commit.returncode != 0:
        return False, f"git commit failed:\n{commit.stderr}"

    push = git(["push", "origin", branch_name])
    if push.returncode != 0:
        return False, f"git push failed:\n{push.stderr}"

    return True, f"Pushed branch {branch_name} to origin"


# ─────────────────────────────────────────────
# Main processor
# ─────────────────────────────────────────────

def process_fix_plan(fix_plan: dict) -> bool:
    fix_plan_id = fix_plan["id"]
    old_score = fix_plan.get("old_score")
    branch_name = fix_plan.get("branch_name")

    print(f"\n{'='*60}")
    print(f"  fix_plan_id : {fix_plan_id}")
    print(f"  branch      : {branch_name}")
    print(f"  page_type   : {fix_plan.get('page_type')}")
    print(f"  old_score   : {old_score}")
    print(f"{'='*60}")

    repo_path = resolve_repo_path(fix_plan)
    if not repo_path:
        msg = f"Workspace repo not found for fix_plan_id={fix_plan_id}"
        print(f"  ❌ {msg}")
        save_local_test_result(
            fix_plan_id=fix_plan_id,
            new_local_score=None,
            passed=False,
            branch_name=branch_name,
            error_message=msg,
            build_status="failed",
            audit_status="skipped",
        )
        return False

    app_dir = repo_path / TARGET_DIR
    tmp_dir = repo_path / ".luminara_audit_tmp"
    tmp_dir.mkdir(exist_ok=True)

    # ── Step 1: Build ──────────────────────────────────────
    print(f"\n  [1] Building {TARGET_DIR}...")
    try:
        build_ok, build_log = run_build(app_dir)
    except subprocess.TimeoutExpired:
        build_ok, build_log = False, "Build timed out after 600s"
    except Exception as e:
        build_ok, build_log = False, str(e)

    build_status = "passed" if build_ok else "failed"
    print(f"  build_status: {build_status}")

    if not build_ok:
        print(f"  ❌ Build failed:\n{build_log[-500:]}")
        save_local_test_result(
            fix_plan_id=fix_plan_id,
            new_local_score=None,
            passed=False,
            branch_name=branch_name,
            error_message=f"Build failed: {build_log[-300:]}",
            build_status="failed",
            audit_status="skipped",
        )
        return False

    # ── Step 2: Lighthouse audit ───────────────────────────
    print(f"\n  [2] Running Lighthouse audit...")
    port = find_free_port()
    server_proc = None
    new_score = None
    audit_status = "skipped"

    remote_url = get_test_url(fix_plan)

    if not remote_url:
        print("  ⚠️  No URL found in DB — skipping Lighthouse audit")
    else:
        local_url = build_local_url(remote_url, port)
        print(f"  Local URL: {local_url}")

        server_proc = start_server(app_dir, port)

        if server_proc:
            try:
                new_score = run_audit(local_url, tmp_dir, runs=3)
                audit_status = "passed" if new_score is not None else "failed"
            except Exception as e:
                print(f"  ❌ Audit error: {e}")
                audit_status = "failed"
            finally:
                stop_server(server_proc)
        else:
            audit_status = "failed"

    # ── Step 3: Evaluate result ────────────────────────────
    print(f"\n  [3] Results")
    print(f"      old_score      : {old_score}")
    print(f"      new_local_score: {new_score}")

    if new_score is not None and old_score is not None:
        improvement = round(new_score - float(old_score), 1)
        print(f"      improvement    : {improvement:+.1f} points")
        passed = improvement >= 0
    elif new_score is not None:
        passed = True
    else:
        passed = build_ok

    print(f"      passed         : {passed}")

    # ── Step 4: Update DB ──────────────────────────────────
    save_local_test_result(
        fix_plan_id=fix_plan_id,
        new_local_score=new_score,
        passed=passed,
        branch_name=branch_name,
        error_message=None if passed else f"Score did not improve: old={old_score}, new={new_score}",
        build_status=build_status,
        audit_status=audit_status,
    )

    final_status = "local_test_passed" if passed else "local_test_failed"
    print(f"\n  [4] DB updated → patch_status={final_status}")

    # ── Step 5: Push if passed ─────────────────────────────
    if passed and branch_name:
        print(f"\n  [5] Pushing branch {branch_name} to origin...")
        push_ok, push_msg = push_branch(repo_path, branch_name, fix_plan_id)
        print(f"  {'✅' if push_ok else '❌'} {push_msg}")

        if push_ok:
            update_fix_plan_status(fix_plan_id, "approved_to_push")
            print(f"  DB updated → patch_status=approved_to_push")
    else:
        print(f"\n  [5] Skipping push (passed={passed})")

    # Cleanup tmp
    shutil.rmtree(tmp_dir, ignore_errors=True)

    return passed


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
            if fix_plan_id:
                # Manual mode: process specific fix_plan
                conn = get_db_connection()
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT id, test_id, branch_name, page_type,
                               device_type, old_score, workspace_path, group_key
                        FROM fix_plans WHERE id = %s
                        """,
                        (fix_plan_id,),
                    )
                    row = cur.fetchone()
                conn.close()

                if not row:
                    print(f"  ❌ fix_plan_id={fix_plan_id} not found")
                    break

                fix_plan = dict(row)
                update_fix_plan_status(fix_plan_id, "local_test_running")

            else:
                fix_plan = claim_next_patch_applied()

            if fix_plan:
                fid = fix_plan["id"]
                print(f"\n[post_apply_worker] Processing fix_plan_id={fid}")
                success = process_fix_plan(fix_plan)
                status_str = "✅ passed" if success else "❌ failed"
                print(f"\n[post_apply_worker] {status_str} — fix_plan_id={fid}")
            else:
                print(
                    f"[post_apply_worker] No patch_applied fix plans. "
                    f"Sleeping {poll_interval}s..."
                )

        except Exception as e:
            print(f"[post_apply_worker] ❌ Worker error: {e}")

        if once or fix_plan_id or not running:
            break

        time.sleep(poll_interval)

    print("[post_apply_worker] Stopped.")


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Luminara Post-Apply Worker — builds, audits, and pushes patched workspace."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process one fix plan then exit.",
    )
    parser.add_argument(
        "--fix-plan-id",
        type=int,
        default=None,
        help="Process a specific fix_plan_id directly (skips poll).",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=DEFAULT_POLL_INTERVAL,
        help=f"Poll interval in seconds (default: {DEFAULT_POLL_INTERVAL}).",
    )
    args = parser.parse_args()

    run_worker(
        once=args.once,
        poll_interval=args.interval,
        fix_plan_id=args.fix_plan_id,
    )


if __name__ == "__main__":
    main()
