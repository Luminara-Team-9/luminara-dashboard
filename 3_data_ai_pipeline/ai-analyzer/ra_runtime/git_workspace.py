"""
git_workspace.py

Git workspace manager for the Remediation Agent.

Purpose:
1. Create an isolated Agent_Workspace for each Fix Plan.
2. Clone the project repository into that workspace.
3. Checkout the failed PR branch.
4. Return the local repo path for later source inspection and patch generation.

This module does NOT modify source files.
It only prepares the workspace.
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv


load_dotenv()


DEFAULT_REPO_URL = os.getenv(
    "GITHUB_REPO_URL",
    "https://github.com/Luminara-Team-9/luminara-dashboard.git",
)

DEFAULT_WORKSPACE_DIR = os.getenv(
    "AGENT_WORKSPACE_DIR",
    "/abr/coss41/Luminara_App/Agent_Workspace",
)


class GitWorkspaceError(RuntimeError):
    """Raised when workspace preparation fails."""


def run_command(
    command: list[str],
    cwd: Optional[Path] = None,
    timeout: int = 300,
) -> subprocess.CompletedProcess:
    """
    Run a shell command safely.

    Args:
        command:
            Command list, for example ["git", "status"].

        cwd:
            Working directory.

        timeout:
            Timeout seconds.

    Returns:
        subprocess.CompletedProcess

    Raises:
        GitWorkspaceError if command fails.
    """
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    if result.returncode != 0:
        raise GitWorkspaceError(
            "Command failed:\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {cwd}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )

    return result


def get_workspace_paths(
    fix_plan_id: int,
    workspace_dir: Optional[str] = None,
) -> Dict[str, Path]:
    """
    Build workspace paths for one Fix Plan.

    Example:
        Agent_Workspace/fix_plan_15/repo
    """
    root = Path(workspace_dir or DEFAULT_WORKSPACE_DIR).resolve()
    fix_workspace = root / f"fix_plan_{fix_plan_id}"
    repo_path = fix_workspace / "repo"

    return {
        "workspace_root": root,
        "fix_workspace": fix_workspace,
        "repo_path": repo_path,
    }


def prepare_workspace(
    fix_plan_id: int,
    pr_branch: str,
    repo_url: Optional[str] = None,
    workspace_dir: Optional[str] = None,
    clean: bool = True,
) -> Dict[str, str]:
    """
    Prepare Agent_Workspace for one Fix Plan.

    Args:
        fix_plan_id:
            Fix Plan ID from fix_plans table.

        pr_branch:
            Failed PR branch name.
            Example: feat/data-ai-pipeline or feature/product-page

        repo_url:
            GitHub repo URL.
            If None, uses GITHUB_REPO_URL from .env.

        workspace_dir:
            Agent workspace root.
            If None, uses AGENT_WORKSPACE_DIR from .env.

        clean:
            If True, remove existing fix_plan workspace before clone.
            For MVP, True is simpler and safer.

    Returns:
        {
            "workspace_path": "...",
            "repo_path": "...",
            "branch": "...",
            "commit_sha": "..."
        }
    """
    if not pr_branch:
        raise GitWorkspaceError("pr_branch is required to prepare workspace.")

    final_repo_url = repo_url or DEFAULT_REPO_URL
    paths = get_workspace_paths(fix_plan_id, workspace_dir)

    workspace_root = paths["workspace_root"]
    fix_workspace = paths["fix_workspace"]
    repo_path = paths["repo_path"]

    workspace_root.mkdir(parents=True, exist_ok=True)

    if clean and fix_workspace.exists():
        shutil.rmtree(fix_workspace)

    fix_workspace.mkdir(parents=True, exist_ok=True)

    print(f"📦 Cloning repo into workspace: {repo_path}")
    run_command(
        ["git", "clone", final_repo_url, str(repo_path)],
        cwd=fix_workspace,
        timeout=600,
    )

    print(f"🌿 Checking out branch: {pr_branch}")
    run_command(["git", "fetch", "origin"], cwd=repo_path, timeout=300)

    # Try checkout local branch from remote branch.
    run_command(
        ["git", "checkout", "-B", pr_branch, f"origin/{pr_branch}"],
        cwd=repo_path,
        timeout=300,
    )

    run_command(["git", "pull", "origin", pr_branch], cwd=repo_path, timeout=300)

    commit_sha = run_command(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_path,
        timeout=60,
    ).stdout.strip()

    return {
        "workspace_path": str(fix_workspace),
        "repo_path": str(repo_path),
        "branch": pr_branch,
        "commit_sha": commit_sha,
    }


if __name__ == "__main__":
    """
    Manual test example.

    Usage:
        python -m ra_runtime.git_workspace
    """
    test_fix_plan_id = int(os.getenv("TEST_FIX_PLAN_ID", "999"))
    test_branch = os.getenv("TEST_PR_BRANCH", "feat/data-ai-pipeline")

    result = prepare_workspace(
        fix_plan_id=test_fix_plan_id,
        pr_branch=test_branch,
        clean=True,
    )

    print("✅ Workspace prepared:")
    for key, value in result.items():
        print(f"{key}: {value}")