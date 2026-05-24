"""
source_context.py

Collect source-code context from the cloned Agent_Workspace repository.

This module is used after git_workspace.py has cloned the failed PR branch.

Purpose:
1. Look inside the cloned target source directory.
2. Find files that are likely related to the Fix Plan.
3. Extract small source snippets for patch generation.
4. Return candidate file paths + snippets.

Important:
- This module does NOT modify source files.
- This module does NOT generate patches.
- This module only collects context for patch_generator.py.
"""

from pathlib import Path
from typing import Any, Dict, List, Tuple


SUPPORTED_EXTENSIONS = {
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".css",
}

IGNORED_DIRS = {
    "node_modules",
    ".next",
    "dist",
    "build",
    ".git",
    ".turbo",
}

MAX_FILE_CHARS = 20000
MAX_SNIPPET_CHARS = 6000
MAX_CANDIDATE_FILES = 8


def normalize_text(value: Any) -> str:
    """
    Convert any value to lowercase searchable text.
    """
    if value is None:
        return ""
    return str(value).lower()


def build_search_keywords(fix_plan: Dict[str, Any]) -> List[str]:
    """
    Build keywords from Fix Plan information.

    Example:
    page_type = product
    affected_metric = LCP
    action = optimize product images

    Output:
    product, detail, image, img, card, lcp
    """
    page_type = normalize_text(fix_plan.get("page_type"))
    affected_metric = normalize_text(fix_plan.get("affected_metric"))
    action = normalize_text(fix_plan.get("action"))
    problem_summary = normalize_text(fix_plan.get("problem_summary"))
    reasoning = normalize_text(fix_plan.get("reasoning"))

    combined = " ".join([
        page_type,
        affected_metric,
        action,
        problem_summary,
        reasoning,
    ])

    keywords = set()

    # Metric / opportunity based keywords
    if "lcp" in combined or "image" in combined or "img" in combined:
        keywords.update([
            "image",
            "img",
            "hero",
            "banner",
            "product",
            "card",
            "grid",
            "promo",
            "picture",
        ])

    if "css" in combined or "fcp" in combined or "render" in combined:
        keywords.update([
            "css",
            "style",
            "styles",
            "globals",
            "layout",
        ])

    if "javascript" in combined or "js" in combined or "tbt" in combined:
        keywords.update([
            "script",
            "provider",
            "analytics",
            "tracker",
            "saboteur",
            "heavy",
        ])

    if "ttfb" in combined or "server" in combined or "cache" in combined:
        keywords.update([
            "config",
            "next.config",
            "cache",
            "server",
            "middleware",
        ])

    # Page-type specific keywords
    if page_type == "main":
        keywords.update([
            "main",
            "landing",
            "hero",
            "banner",
            "promo",
            "product-grid",
            "top-sports",
            "hiker",
        ])

    elif page_type == "product":
        keywords.update([
            "product",
            "detail",
            "productdetail",
            "product-detail",
            "productcard",
            "product-card",
            "image",
        ])

    elif page_type == "cart":
        keywords.update([
            "cart",
            "basket",
            "checkout",
            "product",
            "image",
        ])

    elif page_type == "category":
        keywords.update([
            "category",
            "grid",
            "product",
            "card",
            "filter",
        ])

    # Fallback
    if not keywords:
        keywords.update([
            "page",
            "component",
            "index",
        ])

    return sorted(keywords)


def list_source_files(target_root: Path) -> List[Path]:
    """
    List source files under target_root.
    """
    files: List[Path] = []

    for path in target_root.rglob("*"):
        if not path.is_file():
            continue

        if path.suffix not in SUPPORTED_EXTENSIONS:
            continue

        if any(part in IGNORED_DIRS for part in path.parts):
            continue

        files.append(path)

    return files


def read_file_limited(path: Path, max_chars: int = MAX_FILE_CHARS) -> str:
    """
    Read file content with a safe size limit.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="ignore")

    return text[:max_chars]



def score_file(path: Path, content: str, keywords: List[str], page_type: str = "") -> int:
    """
    Score how relevant a file is to the Fix Plan.

    Higher score means more likely useful for patch generation.
    """
    score = 0
    normalized_page_type = (page_type or "").lower()

    path_text = str(path).lower()
    content_text = content.lower()

    for keyword in keywords:
        if keyword in path_text:
            score += 6
        if keyword in content_text:
            score += 1

    # Strong code signals
    if "<img" in content_text:
        score += 10

    if "next/image" in content_text:
        score += 8

    if "src=" in content_text and "alt=" in content_text:
        score += 4

    # Prefer actual app/component/UI files
    if "/ui/" in path_text:
        score += 4

    if "/page-components/" in path_text:
        score += 4

    if "/widgets/" in path_text:
        score += 3

    if "/entities/" in path_text:
        score += 3

    if "/app/" in path_text:
        score += 2

    # Avoid index barrel files unless no better option
    if path.name in {"index.ts", "index.tsx", "index.js", "index.jsx"}:
        score -= 5

    # Page-scope safety scoring.
    # Prevent patches from selecting files from the wrong page.
    if normalized_page_type == "product":
        if "/page-components/product-detail/" in path_text:
            score += 30
        elif "/entities/product/" in path_text:
            score += 20
        elif "/page-components/main-landing/" in path_text:
            score -= 30
        elif "/widgets/hero-banner/" in path_text:
            score -= 25
        elif "/widgets/promo-banners/" in path_text:
            score -= 25
        elif "/widgets/product-grid/" in path_text:
            score -= 15

    elif normalized_page_type == "main":
        if "/page-components/main-landing/" in path_text:
            score += 30
        elif "/widgets/hero-banner/" in path_text:
            score += 25
        elif "/widgets/promo-banners/" in path_text:
            score += 20
        elif "/widgets/product-grid/" in path_text:
            score += 10

    elif normalized_page_type == "cart":
        if "/page-components/cart/" in path_text or "/app/cart/" in path_text:
            score += 30
        elif "/page-components/main-landing/" in path_text:
            score -= 30
        elif "/widgets/hero-banner/" in path_text:
            score -= 25
        elif "/widgets/promo-banners/" in path_text:
            score -= 25

    elif normalized_page_type == "category":
        if "/page-components/category/" in path_text:
            score += 30
        elif "/widgets/category-grid/" in path_text:
            score += 20
        elif "/entities/product/" in path_text:
            score += 10
        elif "/page-components/main-landing/" in path_text:
            score -= 30


    return score


def find_important_position(content: str, keywords: List[str]) -> int:
    """
    Find the most relevant position inside a file for snippet extraction.

    Important:
    For image optimization, actual JSX tags are more useful than image URL arrays.
    So we prioritize <img and <Image before generic words like image/product.
    """
    lower = content.lower()

    # 1. Highest priority: actual JSX image elements
    high_priority_tokens = [
        "<img",
        "<image",
        "next/image",
    ]

    for token in high_priority_tokens:
        pos = lower.find(token)
        if pos >= 0:
            return pos

    # 2. Medium priority: code-like props
    medium_priority_tokens = [
        "src=",
        "alt=",
        "classname=",
        "style=",
    ]

    for token in medium_priority_tokens:
        pos = lower.find(token)
        if pos >= 0:
            return pos

    # 3. Lower priority: semantic words
    low_priority_tokens = [
        "hero",
        "banner",
        "product",
        "grid",
        "cart",
        "category",
        "image",
    ]

    for token in low_priority_tokens:
        pos = lower.find(token)
        if pos >= 0:
            return pos

    # 4. Fallback to dynamic keywords
    for keyword in keywords:
        pos = lower.find(keyword)
        if pos >= 0:
            return pos

    return 0

def make_snippet(content: str, keywords: List[str]) -> str:
    """
    Create a focused snippet from a file.

    Instead of sending the entire file to Qwen, we send only the relevant part.
    """
    if len(content) <= MAX_SNIPPET_CHARS:
        return content

    center = find_important_position(content, keywords)
    start = max(0, center - 1500)
    end = min(len(content), start + MAX_SNIPPET_CHARS)

    return content[start:end]


def collect_source_context(
    repo_path: str,
    target_dir: str,
    fix_plan: Dict[str, Any],
    max_candidate_files: int = MAX_CANDIDATE_FILES,
) -> Dict[str, Any]:
    """
    Collect relevant source files and snippets.

    Args:
        repo_path:
            Path to cloned repo.
            Example:
            /abr/coss41/Luminara_App/Agent_Workspace/fix_plan_999/repo

        target_dir:
            Relative source directory inside repo.
            Example:
            2_digital_twins/active-staging

        fix_plan:
            Fix Plan data from DB or agent.
            Example keys:
            - page_type
            - affected_metric
            - action
            - problem_summary
            - reasoning

    Returns:
        dict containing candidate files and snippets.
    """
    repo_root = Path(repo_path).resolve()
    target_root = (repo_root / target_dir).resolve()

    if not repo_root.exists():
        raise FileNotFoundError(f"repo_path does not exist: {repo_root}")

    if not target_root.exists():
        raise FileNotFoundError(f"target_dir does not exist: {target_root}")

    keywords = build_search_keywords(fix_plan)
    page_type = normalize_text(fix_plan.get("page_type"))
    source_files = list_source_files(target_root)

    scored_files: List[Dict[str, Any]] = []

    for file_path in source_files:
        content = read_file_limited(file_path)
        score = score_file(file_path, content, keywords, page_type=page_type)

        if score <= 0:
            continue

        relative_path = file_path.relative_to(repo_root)

        scored_files.append({
            "path": str(relative_path),
            "absolute_path": str(file_path),
            "score": score,
            "snippet": make_snippet(content, keywords),
        })

    scored_files.sort(key=lambda item: item["score"], reverse=True)

    return {
        "repo_path": str(repo_root),
        "target_dir": target_dir,
        "target_root": str(target_root),
        "keywords": keywords,
        "total_source_files": len(source_files),
        "matched_files": len(scored_files),
        "candidate_files": scored_files[:max_candidate_files],
    }


if __name__ == "__main__":
    """
    Manual smoke test using the workspace created by git_workspace.py.

    Run:
        python -m ra_runtime.source_context
    """
    test_repo_path = (
        "/abr/coss41/Luminara_App/Agent_Workspace/"
        "fix_plan_999/repo"
    )

    test_target_dir = "2_digital_twins/active-staging"

    sample_fix_plan = {
        "page_type": "product",
        "affected_metric": "LCP",
        "action": "Optimize product images to improve LCP",
        "problem_summary": "Product images may be delaying LCP.",
        "reasoning": "Image loading and sizing can affect LCP on product pages.",
    }

    result = collect_source_context(
        repo_path=test_repo_path,
        target_dir=test_target_dir,
        fix_plan=sample_fix_plan,
    )

    print("✅ Source context collected")
    print("Repo:", result["repo_path"])
    print("Target:", result["target_root"])
    print("Keywords:", result["keywords"])
    print("Total source files:", result["total_source_files"])
    print("Matched files:", result["matched_files"])
    print()

    for item in result["candidate_files"]:
        print("=" * 100)
        print("PATH:", item["path"])
        print("SCORE:", item["score"])
        print("-" * 100)
        print(item["snippet"][:1200])
        print()