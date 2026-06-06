"""
apply_worker.py

Background worker that polls PostgreSQL for Dashboard-approved Fix Plans
and applies them to the cloned Agent_Workspace repo.

Production flow:
1. Dashboard operator sets patch_status = 'approved_to_apply'.
2. This worker picks it up atomically (one worker at a time, SKIP LOCKED).
3. Resolves the repo_path from workspace_path saved by agent.py.
4. Calls apply_patch_result() to do the actual file replacement.
5. Updates fix_plans.patch_status in DB (patch_applied / apply_failed).

Usage:
    # Run continuously (production)
    python apply_worker.py

    # Run once and exit (useful for manual trigger / cron)
    python apply_worker.py --once

    # Dry-run: validate patches without writing files or updating DB
    python apply_worker.py --dry-run

    # Custom poll interval (seconds)
    python apply_worker.py --interval 60
"""

import argparse
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional, Set

from dotenv import load_dotenv

from ra_runtime.apply_patch import (
    apply_patch_result,
    load_patch_result_from_db,
    update_fix_plan_after_apply,
    PatchApplyError,
)
from ra_runtime.db_client import (
    claim_next_approved_fix_plan,
    update_fix_plan_status,
)


load_dotenv()

DEFAULT_WORKSPACE_DIR = os.getenv(
    "AGENT_WORKSPACE_DIR",
    "/abr/coss41/Luminara_App/Agent_Workspace",
)

DEFAULT_POLL_INTERVAL = int(os.getenv("APPLY_WORKER_POLL_INTERVAL", "30"))

WORKER_ID = os.getenv("HOSTNAME", "apply_worker")


# ─────────────────────────────────────────────
# Repo path resolution
# ─────────────────────────────────────────────

def resolve_repo_path(fix_plan: dict) -> str:
    """
    Resolve where the cloned repo lives for this Fix Plan.

    Primary:   workspace_path column saved by agent.py + /repo
    Fallback:  AGENT_WORKSPACE_DIR/fix_plan_<id>/repo

    The agent clones into a workspace_key-based folder, not the integer id.
    So always prefer workspace_path from DB when available.
    """
    workspace_path = fix_plan.get("workspace_path")

    if workspace_path:
        repo = Path(workspace_path) / "repo"

        if repo.exists():
            return str(repo)

        print(
            f"  ⚠️  workspace_path from DB exists but repo folder missing: {repo}\n"
            f"       The workspace may have been cleaned. Trying fallback path."
        )

    fallback = Path(DEFAULT_WORKSPACE_DIR) / f"fix_plan_{fix_plan['id']}" / "repo"
    return str(fallback)


# ─────────────────────────────────────────────
# Process one Fix Plan
# ─────────────────────────────────────────────

def process_fix_plan(fix_plan: dict, dry_run: bool = False) -> bool:
    """
    Load, validate, and apply one approved Fix Plan.

    Returns True if patch was applied (or validated in dry-run).
    """
    fix_plan_id = fix_plan["id"]
    repo_path = resolve_repo_path(fix_plan)

    print(f"\n{'='*60}")
    print(f"  fix_plan_id : {fix_plan_id}")
    print(f"  branch      : {fix_plan.get('branch_name')}")
    print(f"  page_type   : {fix_plan.get('page_type')}")
    print(f"  device_type : {fix_plan.get('device_type')}")
    print(f"  workspace   : {fix_plan.get('workspace_path')}")
    print(f"  repo_path   : {repo_path}")
    if dry_run:
        print("  MODE        : DRY RUN")
    print(f"{'='*60}")

    # Step 1: load approved patch rows from DB
    try:
        patch_result = load_patch_result_from_db(fix_plan_id)

    except PatchApplyError as e:
        print(f"  ❌ Patch load failed: {e}")
        update_fix_plan_status(fix_plan_id, "apply_failed", error_message=str(e))
        return False

    except Exception as e:
        print(f"  ❌ Unexpected error loading patch: {e}")
        update_fix_plan_status(fix_plan_id, "apply_failed", error_message=str(e))
        return False

    patches = patch_result.get("patches", [])
    print(f"\n  [1] Loaded {len(patches)} patch(es) from DB")

    for i, p in enumerate(patches, 1):
        print(f"      [{i}] {p.get('target_file')}")

    # Step 1.5: reset workspace to clean state before applying
    # Workspaces are reused across fix plans for the same branch.
    # A previous failed fix plan may have left broken files behind.
    branch_name = fix_plan.get("branch_name", "")
    if not dry_run and branch_name:
        try:
            reset = subprocess.run(
                ["git", "reset", "--hard", f"origin/{branch_name}"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if reset.returncode == 0:
                print(f"  🧹 Workspace reset to origin/{branch_name} (clean state before apply)")
            else:
                print(f"  ⚠️  Workspace reset failed (non-fatal): {reset.stderr.strip()}")
        except Exception as e:
            print(f"  ⚠️  Workspace reset error (non-fatal): {e}")

    # Step 2: apply patches to cloned repo
    apply_result = apply_patch_result(
        repo_path=repo_path,
        patch_result=patch_result,
        dry_run=dry_run,
    )

    applied = apply_result.get("applied")
    errors = apply_result.get("errors", [])
    applied_patches = apply_result.get("applied_patches", [])

    print(f"\n  [2] Apply result")
    print(f"      applied : {applied}")
    print(f"      errors  : {errors}")

    for p in applied_patches:
        status = p.get("status")
        target = p.get("target_file")
        backup = p.get("backup_path")
        print(f"      → {target}  [{status}]  backup={backup}")

    if apply_result.get("git_diff"):
        print(f"\n  [3] Git diff (first 800 chars):")
        print(apply_result["git_diff"][:800])

    # Step 2.5: TypeScript build check (only when patches applied and not dry-run)
    if applied and not dry_run:
        ts_root = Path(repo_path) / "2_digital_twins" / "active-staging"
        tsc_bin = ts_root / "node_modules" / ".bin" / "tsc"
        tsconfig = ts_root / "tsconfig.json"

        if tsc_bin.exists() and tsconfig.exists():
            print(f"\n  [2.5] Running TypeScript check...")
            tsc_result = subprocess.run(
                [str(tsc_bin), "--noEmit"],
                cwd=str(ts_root),
                capture_output=True,
                text=True,
                timeout=120,
            )
            if tsc_result.returncode != 0:
                tsc_log = tsc_result.stdout + tsc_result.stderr
                print((tsc_log)[-800:])

                # Check if ALL tsc errors are in files the patch never touched.
                # If so, it's a pre-existing error — don't revert, let it proceed.
                patched_files: Set[str] = {
                    p.get("target_file", "") for p in applied_patches
                }
                error_files = re.findall(
                    r"([\w./@\-\[\]]+\.[jt]sx?)(?:\(\d+|(?=\s*\n|\s*$))",
                    tsc_log,
                )
                preexisting = bool(error_files) and all(
                    not any(
                        ef in pf or pf.endswith(ef) or ef.endswith(pf.split("/")[-1])
                        for pf in patched_files
                    )
                    for ef in error_files
                )

                if preexisting:
                    print(
                        f"  ⚠️  tsc errors are in files the patch did NOT touch "
                        f"— pre-existing, proceeding."
                    )
                else:
                    print(f"  ❌ TypeScript check failed — reverting patches")
                    for p in applied_patches:
                        backup = p.get("backup_path")
                        target = p.get("target_file")
                        if backup and Path(backup).exists() and target:
                            shutil.copy2(backup, Path(repo_path) / target)
                            print(f"      reverted {target}")
                    update_fix_plan_status(
                        fix_plan_id,
                        "build_failed",
                        error_message=f"tsc --noEmit failed:\n{tsc_log[-500:]}",
                    )
                    return False
            print(f"  ✅ TypeScript check passed")
        else:
            print(f"  [2.5] TypeScript check skipped (node_modules not installed)")

    # Step 3: update DB status
    if not dry_run:
        update_fix_plan_after_apply(
            fix_plan_id=fix_plan_id,
            apply_result=apply_result,
        )
        final_status = "patch_applied" if applied else "apply_failed"
        print(f"\n  [4] DB updated → patch_status={final_status}")

    return bool(applied or dry_run)


# ─────────────────────────────────────────────
# Main worker loop
# ─────────────────────────────────────────────

def run_worker(
    dry_run: bool = False,
    once: bool = False,
    poll_interval: int = DEFAULT_POLL_INTERVAL,
) -> None:
    print(f"[apply_worker] Starting")
    print(f"  worker_id    : {WORKER_ID}")
    print(f"  dry_run      : {dry_run}")
    print(f"  once         : {once}")
    print(f"  poll_interval: {poll_interval}s")
    print(f"  workspace    : {DEFAULT_WORKSPACE_DIR}")

    running = True

    def _stop(signum, frame):
        nonlocal running
        print("\n[apply_worker] Signal received — shutting down after current job...")
        running = False

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    while running:
        try:
            fix_plan = claim_next_approved_fix_plan(worker_id=WORKER_ID)

            if fix_plan:
                print(f"\n[apply_worker] Claimed fix_plan_id={fix_plan['id']}")
                success = process_fix_plan(fix_plan, dry_run=dry_run)
                status_str = "✅ success" if success else "❌ failed"
                print(f"\n[apply_worker] {status_str} — fix_plan_id={fix_plan['id']}")

            else:
                print(
                    f"[apply_worker] No approved fix plans. "
                    f"Sleeping {poll_interval}s..."
                )

        except Exception as e:
            print(f"[apply_worker] ❌ Worker loop error: {e}")

        if once or not running:
            break

        time.sleep(poll_interval)

    print("[apply_worker] Stopped.")


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Luminara Apply Worker — polls DB and applies approved patches."
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate patches without writing files or updating DB status.",
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help="Claim and process one Fix Plan then exit (useful for manual trigger).",
    )

    parser.add_argument(
        "--interval",
        type=int,
        default=DEFAULT_POLL_INTERVAL,
        help=f"Poll interval in seconds (default: {DEFAULT_POLL_INTERVAL}).",
    )

    args = parser.parse_args()

    run_worker(
        dry_run=args.dry_run,
        once=args.once,
        poll_interval=args.interval,
    )


if __name__ == "__main__":
    main()
