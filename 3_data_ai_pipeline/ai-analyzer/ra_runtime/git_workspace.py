"""
git_workspace.py

Production-ready Git workspace manager for the Luminara Remediation Agent.

Purpose:
1. Create an isolated Agent_Workspace for each Fix Plan or audit group.
2. Clone the project repository into that workspace.
3. Checkout the failed PR branch.
4. Return the local repo path for later source inspection and patch generation.

Important:
- This module does NOT modify source files.
- This module only prepares the workspace.
- apply_patch.py is responsible for applying approved patches later.
"""

import os
import re
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


def sanitize_workspace_key(value: object) -> str:
    """
    Keep workspace folder names filesystem-safe.

    Examples:
        "manual_group/product mobile rank 1"
        -> "manual_group_product_mobile_rank_1"

    This protects Agent_Workspace from branch/thread names that include
    slashes, spaces, or other path-unfriendly characters.
    """
    text = str(value or "unknown").strip()
    text = re.sub(r"[^a-zA-Z0-9_.-]+", "_", text)
    text = text.strip("._-")

    if not text:
        text = "unknown"

    # Keep folder name reasonably short for filesystem safety.
    return text[:160]


def run_command(
    command: list[str],
    cwd: Optional[Path] = None,
    timeout: int = 300,
) -> subprocess.CompletedProcess:
    """
    Run a command safely.

    Args:
        command:
            Command list, for example ["git", "status"].
            Do not pass a shell string.

        cwd:
            Working directory.

        timeout:
            Timeout seconds.

    Returns:
        subprocess.CompletedProcess

    Raises:
        GitWorkspaceError if command fails or times out.
    """
    try:
        result = subprocess.run(
            command,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
    except subprocess.TimeoutExpired as e:
        raise GitWorkspaceError(
            "Command timed out:\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {cwd}\n"
            f"timeout: {timeout}s\n"
            f"stdout:\n{e.stdout or ''}\n"
            f"stderr:\n{e.stderr or ''}"
        ) from e
    except FileNotFoundError as e:
        raise GitWorkspaceError(
            "Command executable not found:\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {cwd}\n"
            f"error: {e}"
        ) from e

    if result.returncode != 0:
        raise GitWorkspaceError(
            "Command failed:\n"
            f"command: {' '.join(command)}\n"
            f"cwd: {cwd}\n"
            f"returncode: {result.returncode}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )

    return result


def get_workspace_paths(
    fix_plan_id: object,
    workspace_dir: Optional[str] = None,
) -> Dict[str, Path]:
    """
    Build workspace paths for one Fix Plan or one audit group.

    The parameter is still named fix_plan_id for compatibility with agent.py,
    but it can safely receive either:
    - integer DB fix_plan_id
    - string workspace key such as manual_group_product_mobile_rank_1

    Example:
        Agent_Workspace/fix_plan_15/repo
        Agent_Workspace/fix_plan_manual_group_product_mobile_rank_1/repo
    """
    root = Path(workspace_dir or DEFAULT_WORKSPACE_DIR).resolve()
    safe_key = sanitize_workspace_key(fix_plan_id)

    fix_workspace = root / f"fix_plan_{safe_key}"
    repo_path = fix_workspace / "repo"

    return {
        "workspace_root": root,
        "fix_workspace": fix_workspace,
        "repo_path": repo_path,
    }


def repo_is_usable(repo_path: Path, pr_branch: str) -> bool:
    """
    Check whether an existing workspace repo can be reused.

    Reuse is useful when:
    - the same PR branch is processed for multiple queued opportunities
    - GitHub/network is temporarily unstable
    - we want faster source_context + patch generation

    This only checks that the repo exists and is on a git commit.
    It does not guarantee the branch is latest.
    """
    if not repo_path.exists():
        return False

    if not (repo_path / ".git").exists():
        return False

    try:
        run_command(["git", "rev-parse", "--is-inside-work-tree"], cwd=repo_path, timeout=30)
        run_command(["git", "rev-parse", "HEAD"], cwd=repo_path, timeout=30)
    except GitWorkspaceError:
        return False

    return True


def get_current_commit(repo_path: Path) -> str:
    """
    Return current commit SHA for traceability.
    """
    return run_command(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_path,
        timeout=60,
    ).stdout.strip()


def prepare_workspace(
    fix_plan_id: object,
    pr_branch: str,
    repo_url: Optional[str] = None,
    workspace_dir: Optional[str] = None,
    clean: bool = True,
    shallow: bool = True,
    allow_reuse_on_failure: bool = True,
) -> Dict[str, str]:
    """
    Prepare Agent_Workspace for one Fix Plan or audit group.

    Args:
        fix_plan_id:
            Existing compatibility name. Can be:
            - DB Fix Plan ID
            - string workspace key from agent.py

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
            If True, remove existing workspace before clone.
            If False and workspace already has a usable repo, reuse it.

        shallow:
            If True, use shallow single-branch clone for faster startup.

        allow_reuse_on_failure:
            If clone fails but an existing repo is usable, reuse it instead
            of failing immediately. This helps during temporary GitHub/DNS issues.

    Returns:
        {
            "workspace_path": "...",
            "repo_path": "...",
            "branch": "...",
            "commit_sha": "...",
            "reused": "true" | "false"
        }
    """
    if not pr_branch:
        raise GitWorkspaceError("pr_branch is required to prepare workspace.")

    final_repo_url = repo_url or DEFAULT_REPO_URL
    if not final_repo_url:
        raise GitWorkspaceError("repo_url is empty. Set GITHUB_REPO_URL or pass repo_url.")

    # Inject GITHUB_TOKEN into HTTPS URL so git can clone private repos.
    # BUG FIX: store safe_repo_url (token masked) separately so it can be used in
    # error messages and logs without leaking the token.
    _token = os.getenv("GITHUB_TOKEN", "")
    if _token and final_repo_url.startswith("https://github.com/"):
        final_repo_url = final_repo_url.replace("https://", f"https://{_token}@")
    safe_repo_url = final_repo_url.replace(_token + "@", "***@") if _token else final_repo_url

    paths = get_workspace_paths(fix_plan_id, workspace_dir)

    workspace_root = paths["workspace_root"]
    fix_workspace = paths["fix_workspace"]
    repo_path = paths["repo_path"]

    workspace_root.mkdir(parents=True, exist_ok=True)

    # Fast path: reuse an existing workspace when clean=False.
    if not clean and repo_is_usable(repo_path, pr_branch):
        print(f"♻️ Reusing existing workspace repo: {repo_path}")

        commit_sha = get_current_commit(repo_path)

        return {
            "workspace_path": str(fix_workspace),
            "repo_path": str(repo_path),
            "branch": pr_branch,
            "commit_sha": commit_sha,
            "reused": "true",
        }

    # Clean requested: remove only this specific fix workspace, never root.
    if clean and fix_workspace.exists():
        print(f"🧹 Removing existing workspace: {fix_workspace}")
        shutil.rmtree(fix_workspace)

    fix_workspace.mkdir(parents=True, exist_ok=True)

    clone_command = [
        "git",
        "clone",
    ]

    if shallow:
        clone_command.extend([
            "--depth",
            "1",
            "--single-branch",
            "--branch",
            pr_branch,
        ])

    clone_command.extend([
        final_repo_url,
        str(repo_path),
    ])

    try:
        print(f"📦 Cloning {safe_repo_url} branch={pr_branch} into workspace: {repo_path}")
        run_command(
            clone_command,
            cwd=fix_workspace,
            timeout=600,
        )

    except GitWorkspaceError as clone_error:
        # Fallback for temporary GitHub/DNS problems.
        if allow_reuse_on_failure and repo_is_usable(repo_path, pr_branch):
            print(
                "⚠️ Clone failed, but existing repo is usable. "
                "Reusing existing workspace."
            )

            commit_sha = get_current_commit(repo_path)

            return {
                "workspace_path": str(fix_workspace),
                "repo_path": str(repo_path),
                "branch": pr_branch,
                "commit_sha": commit_sha,
                "reused": "true",
                "clone_warning": str(clone_error),
            }

        raise

    # If shallow branch clone succeeded, branch should already be checked out.
    # Verify commit for traceability.
    commit_sha = get_current_commit(repo_path)

    current_branch = run_command(
        ["git", "branch", "--show-current"],
        cwd=repo_path,
        timeout=60,
    ).stdout.strip()

    return {
        "workspace_path": str(fix_workspace),
        "repo_path": str(repo_path),
        "branch": current_branch or pr_branch,
        "commit_sha": commit_sha,
        "reused": "false",
    }


if __name__ == "__main__":
    """
    Manual test example.

    Usage:
        python -m ra_runtime.git_workspace
    """
    test_fix_plan_id = os.getenv("TEST_FIX_PLAN_ID", "999")
    test_branch = os.getenv("TEST_PR_BRANCH", "feat/data-ai-pipeline")

    result = prepare_workspace(
        fix_plan_id=test_fix_plan_id,
        pr_branch=test_branch,
        clean=True,
        shallow=True,
    )

    print("✅ Workspace prepared:")
    for key, value in result.items():
        print(f"{key}: {value}")