"""
apply_patch.py

Safely applies a generated source-aware patch to the cloned Agent_Workspace repo.

This module is used AFTER:
1. git_workspace.py cloned the PR branch.
2. source_context.py found relevant source files.
3. patch_generator.py generated a validated patch.

Purpose:
- Apply code_replace patches to files inside Agent_Workspace only.
- Prevent unsafe path traversal.
- Verify original_code exists before replacement.
- Create a backup before modifying the file.
- Return patch application result for dashboard/status updates.

Important:
- This module does NOT push to GitHub.
- This module does NOT modify the original working repository.
- It only modifies the cloned repo_path inside Agent_Workspace.
"""

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


class PatchApplyError(RuntimeError):
    """Raised when a patch cannot be safely applied."""


def run_command(command: List[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    """
    Run shell command and return output.

    Used for git diff after patch application.
    """
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
    )
    return result


def safe_resolve_target(repo_path: str, target_file: str) -> Path:
    """
    Resolve target_file safely inside repo_path.

    Prevents path traversal like ../../etc/passwd.
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
    Create backup before modifying source file.

    Example:
    ProductDetailPage.tsx.bak_20260523_153010
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = file_path.with_name(f"{file_path.name}.bak_{timestamp}")
    backup_path.write_text(
        file_path.read_text(encoding="utf-8", errors="ignore"),
        encoding="utf-8",
    )
    return backup_path


def apply_single_patch(repo_path: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply one code_replace patch.

    Required patch fields:
    - target_file
    - original_code
    - suggested_code
    - change_type
    """
    target_file = patch.get("target_file")
    original_code = patch.get("original_code")
    suggested_code = patch.get("suggested_code")
    change_type = patch.get("change_type", "code_replace")

    if change_type != "code_replace":
        raise PatchApplyError(f"Unsupported change_type: {change_type}")

    if not target_file:
        raise PatchApplyError("target_file is required.")

    if not original_code:
        raise PatchApplyError("original_code is required.")

    if not suggested_code:
        raise PatchApplyError("suggested_code is required.")

    if original_code.strip() == suggested_code.strip():
        raise PatchApplyError("original_code and suggested_code are identical.")

    file_path = safe_resolve_target(repo_path, target_file)

    content = file_path.read_text(encoding="utf-8", errors="ignore")

    occurrence_count = content.count(original_code)

    if occurrence_count == 0:
        raise PatchApplyError(
            "original_code was not found in target file. "
            f"target_file={target_file}"
        )

    if occurrence_count > 1:
        raise PatchApplyError(
            "original_code appears more than once. "
            "Refusing to apply ambiguous patch. "
            f"target_file={target_file}, occurrences={occurrence_count}"
        )

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


def apply_patch_result(repo_path: str, patch_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply patch_generator.py result.

    Args:
        repo_path:
            Agent_Workspace cloned repo path.

        patch_result:
            Output from patch_generator.py.

    Returns:
        {
          "applied": true/false,
          "applied_patches": [...],
          "errors": [...],
          "git_diff": "..."
        }
    """
    if not patch_result.get("auto_applicable"):
        return {
            "applied": False,
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
            "applied_patches": [],
            "errors": ["No patches found."],
            "git_diff": "",
        }

    applied_patches = []
    errors = []

    for patch in patches:
        try:
            applied = apply_single_patch(repo_path, patch)
            applied_patches.append(applied)
        except Exception as e:
            errors.append(str(e))

    repo_root = Path(repo_path).resolve()
    diff_result = run_command(["git", "diff"], cwd=repo_root)

    return {
        "applied": len(applied_patches) > 0 and len(errors) == 0,
        "applied_patches": applied_patches,
        "errors": errors,
        "git_diff": diff_result.stdout,
    }


if __name__ == "__main__":
    """
    Manual smoke test.

    This imports patch_generator.py, generates a patch, and applies it
    to Agent_Workspace/fix_plan_999/repo only.

    Run:
        python -m ra_runtime.apply_patch
    """
    from ra_runtime.patch_generator import generate_patch_from_source
    from ra_runtime.source_context import collect_source_context

    test_repo_path = (
        "/abr/coss41/Luminara_App/Agent_Workspace/"
        "fix_plan_999/repo"
    )

    test_target_dir = "2_digital_twins/active-staging"

    sample_fix_plan = {
        "id": 999,
        "test_id": 80,
        "page_type": "product",
        "device_type": "mobile",
        "affected_metric": "LCP",
        "action": "Optimize product images to improve LCP",
        "problem_summary": "Product images may be delaying LCP.",
        "reasoning": (
            "Image loading and sizing can affect LCP on product pages. "
            "Generate a minimal safe patch from actual source code."
        ),
        "estimated_improvement": 150,
    }

    source_context = collect_source_context(
        repo_path=test_repo_path,
        target_dir=test_target_dir,
        fix_plan=sample_fix_plan,
    )

    patch_result = generate_patch_from_source(
        fix_plan=sample_fix_plan,
        source_context=source_context,
        repo_path=test_repo_path,
    )

    print("\n[1] Generated patch:")
    print(json.dumps(patch_result, indent=2, ensure_ascii=False))

    apply_result = apply_patch_result(
        repo_path=test_repo_path,
        patch_result=patch_result,
    )

    print("\n[2] Apply result:")
    print(json.dumps(apply_result, indent=2, ensure_ascii=False))