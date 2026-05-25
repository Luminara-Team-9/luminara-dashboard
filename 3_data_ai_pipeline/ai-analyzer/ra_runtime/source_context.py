"""
source_context.py

Production-ready source-code context collector for the Luminara Remediation Agent.

Purpose:
1. Search only page-relevant source areas first.
2. Collect source snippets related to the selected Fix Plan and page type.
3. Stay generic across problem types:
   - image/LCP
   - JavaScript/TBT
   - CSS/FCP/render-blocking
   - layout/CLS
   - server/TTFB/config
4. Keep the search fast by limiting roots, file size, and candidate count.

Important:
- This module does NOT modify source files.
- This module does NOT generate patches.
- This module only gives Qwen the best source candidates.
"""

from pathlib import Path
from typing import Any, Dict, List, Set


SUPPORTED_EXTENSIONS = {
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".css",
    ".mjs",
    ".cjs",
    ".json",
}

IGNORED_DIRS = {
    "node_modules",
    ".next",
    "dist",
    "build",
    ".git",
    ".turbo",
    "coverage",
    ".cache",
}

MAX_FILE_CHARS = 20000
MAX_SNIPPET_CHARS = 5000
MAX_CANDIDATE_FILES = 8
MAX_FILES_TO_SCORE = 160


PAGE_PROFILES: Dict[str, Dict[str, List[str]]] = {
    "main": {
        "include_dirs": [
            "src/page-components/main-landing",
            "src/widgets/hero-banner",
            "src/widgets/promo-banners",
            "src/widgets/product-grid",
            "src/widgets/header",
            "src/app",
            "app",
        ],
        "prefer_path_tokens": [
            "main-landing",
            "hero-banner",
            "promo-banners",
            "product-grid",
            "homepage",
            "landing",
            "main",
        ],
        "avoid_path_tokens": [
            "product-detail",
            "cart",
            "checkout",
            "category",
        ],
        "semantic_tokens": [
            "main",
            "landing",
            "home",
            "hero",
            "banner",
            "promo",
            "grid",
        ],
    },
    "product": {
        "include_dirs": [
            "src/page-components/product-detail",
            "src/entities/product",
            "src/widgets/product",
            "src/widgets/header",
            "src/app",
            "app",
        ],
        "prefer_path_tokens": [
            "product-detail",
            "productdetail",
            "entities/product",
            "product-card",
            "productcard",
            "product",
        ],
        "avoid_path_tokens": [
            "main-landing",
            "hero-banner",
            "promo-banners",
            "cart",
            "checkout",
            "category",
        ],
        "semantic_tokens": [
            "product",
            "detail",
            "productdetail",
            "product-card",
            "gallery",
            "price",
            "size",
        ],
    },
    "category": {
        "include_dirs": [
            "src/page-components/category",
            "src/widgets/category",
            "src/widgets/product-grid",
            "src/entities/product",
            "src/app",
            "app",
        ],
        "prefer_path_tokens": [
            "category",
            "category-grid",
            "product-grid",
            "filter",
            "entities/product",
        ],
        "avoid_path_tokens": [
            "main-landing",
            "product-detail",
            "cart",
            "checkout",
        ],
        "semantic_tokens": [
            "category",
            "grid",
            "filter",
            "sort",
            "product",
            "card",
        ],
    },
    "cart": {
        "include_dirs": [
            "src/page-components/cart",
            "src/page-components/checkout",
            "src/entities/cart",
            "src/widgets/cart",
            "src/app",
            "app",
        ],
        "prefer_path_tokens": [
            "cart",
            "checkout",
            "basket",
            "order",
        ],
        "avoid_path_tokens": [
            "main-landing",
            "hero-banner",
            "promo-banners",
            "product-detail",
            "category",
        ],
        "semantic_tokens": [
            "cart",
            "basket",
            "checkout",
            "quantity",
            "order",
            "payment",
        ],
    },
}


FIX_TYPE_KEYWORDS: Dict[str, List[str]] = {
    "image": [
        "image",
        "img",
        "picture",
        "hero",
        "banner",
        "gallery",
        "thumbnail",
        "next/image",
        "src",
        "alt",
        "fetchpriority",
        "loading",
        "decoding",
        "sizes",
        "srcset",
    ],
    "javascript": [
        "javascript",
        "script",
        "dynamic",
        "import",
        "react.lazy",
        "useeffect",
        "provider",
        "analytics",
        "tracker",
        "third-party",
        "heavy",
        "bundle",
        "main thread",
    ],
    "css": [
        "css",
        "style",
        "stylesheet",
        "globals",
        "font",
        "font-display",
        "render",
        "@import",
        "critical",
    ],
    "layout": [
        "layout",
        "cls",
        "width",
        "height",
        "aspect-ratio",
        "min-height",
        "skeleton",
        "placeholder",
    ],
    "server": [
        "config",
        "next.config",
        "middleware",
        "headers",
        "cache",
        "cache-control",
        "cdn",
        "server",
        "redis",
        "rewrites",
    ],
    "unknown": [
        "page",
        "component",
        "index",
    ],
}


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).lower()


def get_fix_text(fix_plan: Dict[str, Any]) -> str:
    opportunity = fix_plan.get("opportunity") or {}

    return " ".join([
        normalize_text(fix_plan.get("affected_metric")),
        normalize_text(fix_plan.get("action")),
        normalize_text(fix_plan.get("problem_summary")),
        normalize_text(fix_plan.get("reasoning")),
        normalize_text(fix_plan.get("page_type")),
        normalize_text(opportunity.get("opportunity_id")),
        normalize_text(opportunity.get("title")),
        normalize_text(opportunity.get("description")),
        normalize_text(opportunity.get("category")),
    ])


def classify_fix_type(fix_plan: Dict[str, Any]) -> str:
    """
    Generic problem classification based on Fix Plan + Lighthouse opportunity text.
    This does not decide the fix. It only helps select better source context.
    """
    text = get_fix_text(fix_plan)

    if any(k in text for k in [
        "server-response",
        "server response",
        "time to first byte",
        "ttfb",
        "cache-control",
        "cdn",
        "redis",
        "memcached",
        "backend",
        "server-side",
    ]):
        return "server"

    if any(k in text for k in [
        "unused-javascript",
        "legacy-javascript",
        "javascript",
        "total blocking time",
        "tbt",
        "main thread",
        "bootup",
        "script",
        "third-party",
        "bundle",
    ]):
        return "javascript"

    if any(k in text for k in [
        "render-blocking",
        "css",
        "stylesheet",
        "first contentful paint",
        "fcp",
        "font-display",
        "@import",
    ]):
        return "css"

    if any(k in text for k in [
        "cumulative layout shift",
        "cls",
        "layout shift",
        "aspect-ratio",
    ]):
        return "layout"

    if any(k in text for k in [
        "prioritize-lcp-image",
        "largest contentful paint",
        "lcp",
        "image",
        "img",
        "next-gen",
        "offscreen",
        "responsive images",
        "properly size",
        "webp",
        "avif",
    ]):
        return "image"

    return "unknown"


def tokenize_text(text: str) -> Set[str]:
    tokens = set(replace_separators(text).split())
    return {
        token
        for token in tokens
        if len(token) >= 3
        and token not in {
            "the", "and", "for", "with", "from", "this", "that",
            "page", "fix", "plan", "issue", "using", "use",
        }
    }


def replace_separators(text: str) -> str:
    for char in ["/", "\\", "-", "_", ".", ":", "(", ")", "[", "]", "{", "}", ",", "'"]:
        text = text.replace(char, " ")
    return text


def build_search_keywords(
    fix_plan: Dict[str, Any],
    page_type: str,
    fix_type: str,
) -> List[str]:
    """
    Build generic keywords from:
    - page type
    - fix type
    - Fix Plan text
    - Lighthouse opportunity text

    Page-related terms are always included, but image terms are not added
    unless the selected opportunity is image/layout-related.
    """
    keywords: Set[str] = set()

    profile = PAGE_PROFILES.get(page_type, {})
    keywords.update(profile.get("semantic_tokens", []))
    keywords.update(FIX_TYPE_KEYWORDS.get(fix_type, FIX_TYPE_KEYWORDS["unknown"]))

    fix_text = get_fix_text(fix_plan)
    keywords.update(tokenize_text(fix_text))

    if not keywords:
        keywords.update(FIX_TYPE_KEYWORDS["unknown"])

    return sorted(keywords)


def should_ignore_path(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def get_search_roots(target_root: Path, page_type: str, fix_type: str) -> List[Path]:
    """
    Faster approach:
    Search page-specific roots first instead of scanning the whole app.
    Fallback to target_root if no expected roots exist.
    """
    profile = PAGE_PROFILES.get(page_type, {})
    include_dirs = list(profile.get("include_dirs", []))

    # Server/config issues may live outside page folders.
    if fix_type == "server":
        include_dirs.extend([
            "",
            "src",
            "config",
        ])

    roots: List[Path] = []
    seen = set()

    for relative in include_dirs:
        candidate = (target_root / relative).resolve() if relative else target_root
        if candidate.exists() and candidate.is_dir() and candidate not in seen:
            roots.append(candidate)
            seen.add(candidate)

    if not roots:
        roots = [target_root]

    return roots


def list_source_files(
    target_root: Path,
    page_type: str,
    fix_type: str,
) -> List[Path]:
    """
    List source files under page-relevant roots first.
    """
    files: List[Path] = []
    seen = set()

    for root in get_search_roots(target_root, page_type, fix_type):
        for path in root.rglob("*"):
            if len(files) >= MAX_FILES_TO_SCORE:
                break

            if not path.is_file():
                continue

            if should_ignore_path(path):
                continue

            if path.suffix not in SUPPORTED_EXTENSIONS:
                continue

            if path in seen:
                continue

            files.append(path)
            seen.add(path)

    return files


def read_file_limited(path: Path, max_chars: int = MAX_FILE_CHARS) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="ignore")

    return text[:max_chars]


def score_page_scope(path_text: str, page_type: str) -> int:
    """
    Keep candidates page-related.
    Product page should prefer product-detail files.
    Main page should prefer main-landing files.
    Other pages should prefer their own page folders.
    """
    if not page_type:
        return 0

    profile = PAGE_PROFILES.get(page_type)

    if not profile:
        return 0

    score = 0

    for token in profile.get("prefer_path_tokens", []):
        if token in path_text:
            score += 25

    for token in profile.get("avoid_path_tokens", []):
        if token in path_text:
            score -= 35

    return score


def score_fix_type_signals(
    path_text: str,
    content_text: str,
    fix_type: str,
) -> int:
    """
    Strong code signals depend on selected problem type.
    This avoids always preferring image snippets.
    """
    score = 0

    if fix_type in {"image", "layout"}:
        if "<img" in content_text:
            score += 14
        if "next/image" in content_text:
            score += 12
        if "src=" in content_text and "alt=" in content_text:
            score += 8
        if "width=" in content_text or "height=" in content_text:
            score += 5

    elif fix_type == "javascript":
        if "dynamic(" in content_text or "react.lazy" in content_text:
            score += 14
        if "import(" in content_text:
            score += 10
        if "useeffect" in content_text:
            score += 6
        if "<script" in content_text or "script" in content_text:
            score += 10
        if "analytics" in content_text or "tracker" in content_text:
            score += 8
        if path_text.endswith((".ts", ".js", ".tsx", ".jsx")):
            score += 3

    elif fix_type == "css":
        if path_text.endswith(".css"):
            score += 14
        if "@import" in content_text:
            score += 10
        if "font-display" in content_text:
            score += 10
        if "stylesheet" in content_text:
            score += 8
        if "globals" in path_text:
            score += 6

    elif fix_type == "server":
        if "next.config" in path_text:
            score += 24
        if "middleware" in path_text:
            score += 18
        if "package.json" in path_text:
            score += 10
        if "headers" in content_text or "cache-control" in content_text:
            score += 14
        if "rewrites" in content_text or "redirects" in content_text:
            score += 8

    else:
        if "/page-components/" in path_text:
            score += 4
        if "/widgets/" in path_text:
            score += 3
        if "/entities/" in path_text:
            score += 3

    return score


def score_file(
    path: Path,
    content: str,
    keywords: List[str],
    page_type: str = "",
    fix_type: str = "unknown",
) -> int:
    score = 0

    path_text = str(path).lower()
    content_text = content.lower()
    normalized_page_type = normalize_text(page_type)

    # Page scope is more important than generic keyword match.
    score += score_page_scope(path_text, normalized_page_type)

    # Generic keyword score.
    for keyword in keywords:
        keyword = keyword.lower()
        if keyword in path_text:
            score += 6
        if keyword in content_text:
            score += 1

    # Problem-type-specific code signals.
    score += score_fix_type_signals(path_text, content_text, fix_type)

    # Prefer useful source files.
    if "/ui/" in path_text:
        score += 5
    if "/page-components/" in path_text:
        score += 5
    if "/widgets/" in path_text:
        score += 3
    if "/entities/" in path_text:
        score += 3
    if "/app/" in path_text:
        score += 2

    # Avoid barrel files unless no better option exists.
    if path.name in {"index.ts", "index.tsx", "index.js", "index.jsx"}:
        score -= 8

    # Avoid mocks/data-only files for code patching unless image issue needs asset arrays.
    if "mock" in path_text or "data" in path_text:
        if fix_type not in {"image", "layout"}:
            score -= 10

    return score


def priority_tokens_for_fix_type(fix_type: str, keywords: List[str]) -> List[str]:
    if fix_type in {"image", "layout"}:
        return [
            "<img",
            "<image",
            "next/image",
            "src=",
            "alt=",
            "fetchpriority",
            "loading=",
            "decoding=",
            "width=",
            "height=",
            "aspect-ratio",
        ]

    if fix_type == "javascript":
        return [
            "dynamic(",
            "import(",
            "react.lazy",
            "useeffect",
            "<script",
            "script",
            "analytics",
            "tracker",
            "provider",
            "heavy",
        ]

    if fix_type == "css":
        return [
            "@import",
            "font-display",
            "stylesheet",
            "globals.css",
            ".css",
            "className=",
            "style=",
        ]

    if fix_type == "server":
        return [
            "next.config",
            "middleware",
            "headers",
            "cache-control",
            "rewrites",
            "redirects",
            "cdn",
        ]

    return list(keywords)


def find_important_position(
    content: str,
    keywords: List[str],
    fix_type: str = "unknown",
) -> int:
    lower = content.lower()

    for token in priority_tokens_for_fix_type(fix_type, keywords):
        pos = lower.find(token.lower())
        if pos >= 0:
            return pos

    for keyword in keywords:
        pos = lower.find(keyword.lower())
        if pos >= 0:
            return pos

    return 0


def make_snippet(
    content: str,
    keywords: List[str],
    fix_type: str = "unknown",
) -> str:
    if len(content) <= MAX_SNIPPET_CHARS:
        return content

    center = find_important_position(content, keywords, fix_type)

    # Keep near the important code. Smaller pre-context is faster and avoids
    # sending long URL arrays before actual JSX.
    start = max(0, center - 500)
    end = min(len(content), start + MAX_SNIPPET_CHARS)

    return content[start:end]


def collect_source_context(
    repo_path: str,
    target_dir: str,
    fix_plan: Dict[str, Any],
    max_candidate_files: int = MAX_CANDIDATE_FILES,
) -> Dict[str, Any]:
    repo_root = Path(repo_path).resolve()
    target_root = (repo_root / target_dir).resolve()

    if not repo_root.exists():
        raise FileNotFoundError(f"repo_path does not exist: {repo_root}")

    if not target_root.exists():
        raise FileNotFoundError(f"target_dir does not exist: {target_root}")

    page_type = normalize_text(fix_plan.get("page_type"))
    fix_type = classify_fix_type(fix_plan)
    keywords = build_search_keywords(
        fix_plan=fix_plan,
        page_type=page_type,
        fix_type=fix_type,
    )

    source_files = list_source_files(
        target_root=target_root,
        page_type=page_type,
        fix_type=fix_type,
    )

    scored_files: List[Dict[str, Any]] = []

    for file_path in source_files:
        content = read_file_limited(file_path)

        score = score_file(
            path=file_path,
            content=content,
            keywords=keywords,
            page_type=page_type,
            fix_type=fix_type,
        )

        if score <= 0:
            continue

        relative_path = file_path.relative_to(repo_root)

        scored_files.append({
            "path": str(relative_path),
            "absolute_path": str(file_path),
            "score": score,
            "fix_type": fix_type,
            "snippet": make_snippet(
                content=content,
                keywords=keywords,
                fix_type=fix_type,
            ),
        })

    scored_files.sort(key=lambda item: item["score"], reverse=True)

    return {
        "repo_path": str(repo_root),
        "target_dir": target_dir,
        "target_root": str(target_root),
        "page_type": page_type,
        "fix_type": fix_type,
        "keywords": keywords,
        "total_source_files": len(source_files),
        "matched_files": len(scored_files),
        "candidate_files": scored_files[:max_candidate_files],
    }


if __name__ == "__main__":
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
        "opportunity": {
            "opportunity_id": "prioritize-lcp-image",
            "title": "Preload Largest Contentful Paint image",
            "category": "image",
        },
    }

    result = collect_source_context(
        repo_path=test_repo_path,
        target_dir=test_target_dir,
        fix_plan=sample_fix_plan,
    )

    print("✅ Source context collected")
    print("Repo:", result["repo_path"])
    print("Target:", result["target_root"])
    print("Page type:", result["page_type"])
    print("Fix type:", result["fix_type"])
    print("Keywords:", result["keywords"])
    print("Total source files scanned:", result["total_source_files"])
    print("Matched files:", result["matched_files"])
    print()

    for item in result["candidate_files"]:
        print("=" * 100)
        print("PATH:", item["path"])
        print("SCORE:", item["score"])
        print("FIX TYPE:", item["fix_type"])
        print("-" * 100)
        print(item["snippet"][:1200])
        print()