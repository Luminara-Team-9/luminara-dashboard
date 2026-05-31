"""
apply_patch.py

Production-style patch applier for the Luminara Remediation Agent.

This module does NOT call Qwen.
It reads an already-generated and approved patch from PostgreSQL, then applies
that exact patch to the cloned Agent_Workspace repo.

Production flow:
1. patch_generator.py creates source-aware patch_result.
2. agent.py/listener.py saves patch rows into fix_plan_changes.
3. Dashboard/operator approves the Fix Plan.
4. apply_patch.py reads the approved fix_plan_changes rows.
5. apply_patch.py applies the exact stored patch to Agent_Workspace/fix_plan_<id>/repo.

Important:
- No hardcoded product page patch.
- No re-generation.
- No GitHub push.
- Only modifies the cloned workspace repo.
"""

import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv


load_dotenv()


DEFAULT_WORKSPACE_DIR = os.getenv(
    "AGENT_WORKSPACE_DIR",
    "/abr/coss41/Luminara_App/Agent_Workspace",
)

APPROVED_STATUSES = {
    "approved_to_apply",
    "approved",
    "ready_to_apply",
    "applying",
}


class PatchApplyError(RuntimeError):
    """Raised when a patch cannot be safely applied."""


def get_db_connection():
    """Connect to PostgreSQL core_db."""
    return psycopg2.connect(
        host=os.getenv("HOST_IP", "127.0.0.1"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def run_command(
    command: List[str],
    cwd: Optional[Path] = None,
    timeout: int = 300,
) -> subprocess.CompletedProcess:
    """Run a command and return completed process."""
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def default_repo_path_for_fix_plan(
    fix_plan_id: int,
    workspace_dir: Optional[str] = None,
) -> Path:
    """
    Default repo path:
    /abr/coss41/Luminara_App/Agent_Workspace/fix_plan_<id>/repo
    """
    root = Path(workspace_dir or DEFAULT_WORKSPACE_DIR).resolve()
    return root / f"fix_plan_{fix_plan_id}" / "repo"


def load_patch_result_from_db(fix_plan_id: int) -> Dict[str, Any]:
    """
    Load approved patch_result from DB.

    Reads:
    - fix_plans for approval/status
    - fix_plan_changes for exact target_file/original_code/suggested_code

    Returns patch_result shape:
    {
      "auto_applicable": true,
      "patches": [...],
      "manual_review_reason": null
    }
    """
    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                id,
                thread_id,
                patch_status,
                approved_by,
                branch_name
            FROM fix_plans
            WHERE id = %s
            """,
            (fix_plan_id,),
        )

        row = cursor.fetchone()

        if not row:
            raise PatchApplyError(f"Fix Plan not found: id={fix_plan_id}")

        (
            db_fix_plan_id,
            thread_id,
            patch_status,
            approved_by,
            branch_name,
        ) = row

        if patch_status not in APPROVED_STATUSES:
            raise PatchApplyError(
                "Fix Plan is not approved for apply. "
                f"fix_plan_id={fix_plan_id}, patch_status={patch_status}"
            )

        cursor.execute(
            """
            SELECT
                id,
                target_file,
                original_code,
                suggested_code,
                change_type,
                change_reason
            FROM fix_plan_changes
            WHERE fix_plan_id = %s
            ORDER BY id ASC
            """,
            (fix_plan_id,),
        )

        change_rows = cursor.fetchall()

        if not change_rows:
            raise PatchApplyError(
                f"No fix_plan_changes found for fix_plan_id={fix_plan_id}"
            )

        patches = []

        for change in change_rows:
            (
                change_id,
                target_file,
                original_code,
                suggested_code,
                change_type,
                change_reason,
            ) = change

            patches.append(
                {
                    "change_id": change_id,
                    "target_file": target_file,
                    "original_code": original_code,
                    "suggested_code": suggested_code,
                    "change_type": change_type or "code_replace",
                    "change_reason": change_reason,
                }
            )

        return {
            "auto_applicable": True,
            "patches": patches,
            "manual_review_reason": None,
            "metadata": {
                "fix_plan_id": db_fix_plan_id,
                "thread_id": thread_id,
                "patch_status": patch_status,
                "approved_by": approved_by,
                "branch_name": branch_name,
            },
        }

    finally:
        if conn:
            conn.close()


def safe_resolve_target(repo_path: str, target_file: str) -> Path:
    """
    Resolve target_file safely inside repo_path.

    Prevents path traversal such as ../../etc/passwd.
    """
    repo_root = Path(repo_path).resolve()
    file_path = (repo_root / target_file).resolve()

    if not str(file_path).startswith(str(repo_root)):
        raise PatchApplyError(
            f"Unsafe target path outside repo: {target_file}"
        )

    if not file_path.exists():
        raise PatchApplyError(
            f"Target file does not exist: {file_path}"
        )

    if not file_path.is_file():
        raise PatchApplyError(
            f"Target path is not a file: {file_path}"
        )

    return file_path


def create_backup(file_path: Path) -> Path:
    """
    Create a backup before modifying source file.

    Example:
    ProductDetailPage.tsx.bak_20260524_223010
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = file_path.with_name(f"{file_path.name}.bak_{timestamp}")

    shutil.copy2(file_path, backup_path)

    return backup_path


def restore_backups(backups: List[Dict[str, str]]) -> None:
    """
    Restore modified files from backups if a later patch fails.
    """
    for item in reversed(backups):
        backup_path = Path(item["backup_path"])
        file_path = Path(item["file_path"])

        if backup_path.exists():
            shutil.copy2(backup_path, file_path)


def validate_patch_shape(patch: Dict[str, Any]) -> None:
    """Validate required patch fields."""
    required = [
        "target_file",
        "original_code",
        "suggested_code",
    ]

    for key in required:
        if not patch.get(key):
            raise PatchApplyError(f"Patch missing required field: {key}")

    if patch.get("change_type", "code_replace") != "code_replace":
        raise PatchApplyError(
            f"Unsupported change_type: {patch.get('change_type')}"
        )

    if patch["original_code"].strip() == patch["suggested_code"].strip():
        raise PatchApplyError(
            "original_code and suggested_code are identical."
        )


def apply_single_patch(
    repo_path: str,
    patch: Dict[str, Any],
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Apply one code_replace patch.

    Safety checks:
    - target file exists inside repo
    - original_code exists exactly once
    - suggested_code is different
    - backup created before write
    """
    validate_patch_shape(patch)

    target_file = patch["target_file"]
    original_code = patch["original_code"]
    suggested_code = patch["suggested_code"]

    file_path = safe_resolve_target(repo_path, target_file)
    content = file_path.read_text(encoding="utf-8", errors="ignore")

    occurrence_count = content.count(original_code)

    if occurrence_count == 0:
        if suggested_code in content:
            return {
                "target_file": target_file,
                "status": "already_applied",
                "backup_path": None,
                "occurrence_count": 0,
                "change_reason": patch.get("change_reason"),
            }

        raise PatchApplyError(
            "original_code was not found in target file. "
            f"target_file={target_file}"
        )

    if occurrence_count > 1:
        raise PatchApplyError(
            "original_code appears more than once. "
            "Refusing ambiguous patch. "
            f"target_file={target_file}, occurrences={occurrence_count}"
        )

    if dry_run:
        return {
            "target_file": target_file,
            "status": "validated_dry_run",
            "backup_path": None,
            "occurrence_count": occurrence_count,
            "change_reason": patch.get("change_reason"),
        }

    backup_path = create_backup(file_path)

    new_content = content.replace(original_code, suggested_code, 1)
    file_path.write_text(new_content, encoding="utf-8")

    return {
        "target_file": target_file,
        "status": "applied",
        "backup_path": str(backup_path),
        "occurrence_count": occurrence_count,
        "change_reason": patch.get("change_reason"),
    }


def get_git_diff(repo_path: str) -> str:
    """Return git diff for workspace repo."""
    repo_root = Path(repo_path).resolve()
    diff_result = run_command(["git", "diff"], cwd=repo_root)

    return diff_result.stdout or ""


def apply_patch_result(
    repo_path: str,
    patch_result: Dict[str, Any],
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Apply patch_result to repo_path.

    If any patch fails, already-applied patches are rolled back from backup.
    """
    if not patch_result.get("auto_applicable"):
        return {
            "applied": False,
            "dry_run": dry_run,
            "applied_patches": [],
            "errors": [
                patch_result.get(
                    "manual_review_reason",
                    "Patch result is not auto-applicable.",
                )
            ],
            "git_diff": "",
        }

    patches = patch_result.get("patches", [])

    if not patches:
        return {
            "applied": False,
            "dry_run": dry_run,
            "applied_patches": [],
            "errors": ["No patches found."],
            "git_diff": "",
        }

    repo_root = Path(repo_path).resolve()

    if not repo_root.exists():
        return {
            "applied": False,
            "dry_run": dry_run,
            "applied_patches": [],
            "errors": [f"repo_path does not exist: {repo_root}"],
            "git_diff": "",
        }

    applied_patches = []
    errors = []
    backups = []

    for patch in patches:
        try:
            result = apply_single_patch(
                repo_path=repo_path,
                patch=patch,
                dry_run=dry_run,
            )

            applied_patches.append(result)

            if result.get("backup_path"):
                target_path = safe_resolve_target(
                    repo_path,
                    result["target_file"],
                )
                backups.append(
                    {
                        "backup_path": result["backup_path"],
                        "file_path": str(target_path),
                    }
                )

        except Exception as e:
            errors.append(str(e))

            if backups and not dry_run:
                restore_backups(backups)

            break

    git_diff = "" if dry_run else get_git_diff(repo_path)

    success_statuses = {
        "applied",
        "already_applied",
        "validated_dry_run",
    }

    applied_ok = (
        len(errors) == 0
        and len(applied_patches) == len(patches)
        and all(p["status"] in success_statuses for p in applied_patches)
    )

    return {
        "applied": applied_ok and not dry_run,
        "dry_run": dry_run,
        "applied_patches": applied_patches,
        "errors": errors,
        "git_diff": git_diff,
    }


def update_fix_plan_after_apply(
    fix_plan_id: int,
    apply_result: Dict[str, Any],
) -> None:
    """
    Update fix_plans status after apply.

    Only updates DB for real apply, not dry-run.
    """
    if apply_result.get("dry_run"):
        return

    status = "patch_applied" if apply_result.get("applied") else "apply_failed"

    history_event = {
        "event": status,
        "time": datetime.now().isoformat(),
        "applied": apply_result.get("applied"),
        "errors": apply_result.get("errors", []),
        "applied_patches": apply_result.get("applied_patches", []),
    }

    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE fix_plans
            SET
                patch_status = %s,
                attempt_history =
                    COALESCE(attempt_history, '[]'::jsonb) || %s::jsonb,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                status,
                json.dumps([history_event], ensure_ascii=False),
                fix_plan_id,
            ),
        )

        conn.commit()

    except Exception:
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Apply approved Luminara Fix Plan patch."
    )

    parser.add_argument(
        "--fix-plan-id",
        type=int,
        required=True,
        help="Approved fix_plan id to apply.",
    )

    parser.add_argument(
        "--repo-path",
        default=None,
        help=(
            "Optional cloned repo path. "
            "Default: AGENT_WORKSPACE_DIR/fix_plan_<id>/repo"
        ),
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate patch without modifying files or DB.",
    )

    args = parser.parse_args()

    repo_path = args.repo_path or str(
        default_repo_path_for_fix_plan(args.fix_plan_id)
    )

    patch_result = load_patch_result_from_db(args.fix_plan_id)

    print("\n[1] Loaded approved patch from DB:")
    print(json.dumps(patch_result, indent=2, ensure_ascii=False, default=str))

    apply_result = apply_patch_result(
        repo_path=repo_path,
        patch_result=patch_result,
        dry_run=args.dry_run,
    )

    print("\n[2] Apply result:")
    print(json.dumps(apply_result, indent=2, ensure_ascii=False, default=str))

    update_fix_plan_after_apply(
        fix_plan_id=args.fix_plan_id,
        apply_result=apply_result,
    )


if __name__ == "__main__":
    main()