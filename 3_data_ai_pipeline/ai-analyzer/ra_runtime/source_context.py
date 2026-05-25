"""
source_context.py

Source-code context collector for Luminara Remediation Agent.

Updated version:
- Uses repo_map.json from repo_structure_analyzer.py first
- Falls back to directory scanning if repo_map.json is missing
- Does NOT modify code
- Only returns best source candidates for Qwen
"""

from pathlib import Path
from typing import Any, Dict, List, Set
import json


SUPPORTED_EXTENSIONS = {
    ".tsx", ".ts", ".jsx", ".js", ".css", ".mjs", ".cjs", ".json"
}

IGNORED_DIRS = {
    "node_modules", ".next", "dist", "build", ".git",
    ".turbo", "coverage", ".cache"
}

MAX_FILE_CHARS = 20000
MAX_SNIPPET_CHARS = 5000
MAX_CANDIDATE_FILES = 8
MAX_FILES_TO_SCORE = 160


FIX_TYPE_KEYWORDS: Dict[str, List[str]] = {
    "image": [
        "image", "img", "picture", "hero", "banner", "gallery",
        "thumbnail", "next/image", "src", "alt", "fetchpriority",
        "loading", "decoding", "sizes", "srcset",
    ],
    "javascript": [
        "javascript", "script", "dynamic", "import", "react.lazy",
        "useeffect", "provider", "analytics", "tracker", "third-party",
        "heavy", "bundle", "main thread",
    ],
    "css": [
        "css", "style", "stylesheet", "globals", "font",
        "font-display", "render", "@import", "critical",
    ],
    "layout": [
        "layout", "cls", "width", "height", "aspect-ratio",
        "min-height", "skeleton", "placeholder",
    ],
    "server": [
        "config", "next.config", "middleware", "headers", "cache",
        "cache-control", "cdn", "server", "redis", "rewrites",
    ],
    "unknown": ["page", "component", "index"],
}


PAGE_KEYWORDS = {
    "main": ["main", "home", "homepage", "landing", "hero", "banner"],
    "product": ["product", "detail", "gallery", "product-card"],
    "category": ["category", "grid", "filter", "sort"],
    "cart": ["cart", "basket", "checkout", "order", "payment"],
}


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).lower()


def get_nested_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def replace_separators(text: str) -> str:
    for char in ["/", "\\", "-", "_", ".", ":", "(", ")", "[", "]", "{", "}", ",", "'"]:
        text = text.replace(char, " ")
    return text


def tokenize_text(text: str) -> Set[str]:
    tokens = set(replace_separators(text).split())
    stopwords = {
        "the", "and", "for", "with", "from", "this", "that",
        "page", "fix", "plan", "issue", "using", "use",
    }
    return {t for t in tokens if len(t) >= 3 and t not in stopwords}


def get_attempt_history_text(fix_plan: Dict[str, Any]) -> str:
    history = fix_plan.get("attempt_history")

    if not isinstance(history, list):
        return ""

    parts: List[str] = []

    for item in history:
        if not isinstance(item, dict):
            continue

        parts.extend([
            normalize_text(item.get("lighthouse_opportunity_id")),
            normalize_text(item.get("source_patch_reason")),
            normalize_text(item.get("patch_status")),
        ])

        rag_evidence = item.get("rag_evidence")
        if isinstance(rag_evidence, list):
            for evidence in rag_evidence:
                if not isinstance(evidence, dict):
                    continue
                parts.extend([
                    normalize_text(evidence.get("title")),
                    normalize_text(evidence.get("source")),
                    normalize_text(evidence.get("doc_type")),
                ])

    return " ".join(part for part in parts if part)


def get_fix_text(fix_plan: Dict[str, Any]) -> str:
    opportunity = get_nested_dict(fix_plan.get("opportunity"))
    risk_details = get_nested_dict(fix_plan.get("risk_details"))

    parts = [
        normalize_text(fix_plan.get("affected_metric")),
        normalize_text(fix_plan.get("action")),
        normalize_text(fix_plan.get("problem_summary")),
        normalize_text(fix_plan.get("reasoning")),
        normalize_text(fix_plan.get("impact_if_fixed")),
        normalize_text(fix_plan.get("priority")),
        normalize_text(fix_plan.get("priority_level")),
        normalize_text(fix_plan.get("page_type")),
        normalize_text(fix_plan.get("device_type")),
        normalize_text(fix_plan.get("site_type")),
        normalize_text(fix_plan.get("opportunity_id")),
        normalize_text(fix_plan.get("lighthouse_opportunity_id")),
        normalize_text(fix_plan.get("category")),

        normalize_text(opportunity.get("opportunity_id")),
        normalize_text(opportunity.get("title")),
        normalize_text(opportunity.get("description")),
        normalize_text(opportunity.get("category")),
        normalize_text(opportunity.get("affected_metric")),

        normalize_text(risk_details.get("category")),
        normalize_text(risk_details.get("failed_metrics")),
        normalize_text(risk_details.get("group_key")),
        normalize_text(risk_details.get("page_type")),
        normalize_text(risk_details.get("device_type")),

        get_attempt_history_text(fix_plan),
    ]

    return " ".join(part for part in parts if part)


def classify_fix_type(fix_plan: Dict[str, Any]) -> str:
    text = get_fix_text(fix_plan)

    if any(k in text for k in [
        "server-response", "server response", "time to first byte",
        "ttfb", "cache-control", "cdn", "redis", "memcached",
        "backend", "server-side",
    ]):
        return "server"

    if any(k in text for k in [
        "unused-javascript", "legacy-javascript", "javascript",
        "total blocking time", "tbt", "main thread", "bootup",
        "script", "third-party", "bundle",
    ]):
        return "javascript"

    if any(k in text for k in [
        "render-blocking", "css", "stylesheet",
        "first contentful paint", "fcp", "font-display", "@import",
    ]):
        return "css"

    if any(k in text for k in [
        "cumulative layout shift", "cls", "layout shift", "aspect-ratio",
    ]):
        return "layout"

    if any(k in text for k in [
        "prioritize-lcp-image", "largest contentful paint", "lcp",
        "image", "img", "next-gen", "offscreen",
        "responsive images", "properly size", "webp", "avif",
    ]):
        return "image"

    return "unknown"


def build_search_keywords(
    fix_plan: Dict[str, Any],
    page_type: str,
    fix_type: str,
) -> List[str]:
    keywords: Set[str] = set()

    keywords.update(PAGE_KEYWORDS.get(page_type, []))
    keywords.update(FIX_TYPE_KEYWORDS.get(fix_type, FIX_TYPE_KEYWORDS["unknown"]))
    keywords.update(tokenize_text(get_fix_text(fix_plan)))

    return sorted(keywords)


def should_ignore_path(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def read_file_limited(path: Path, max_chars: int = MAX_FILE_CHARS) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

    return text[:max_chars]


def load_repo_map(repo_map_path: str) -> Dict[str, Any]:
    path = Path(repo_map_path)

    if not path.exists():
        return {}

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def path_matches_page(path: str, page_type: str) -> bool:
    p = path.lower()

    if not page_type:
        return True

    if page_type == "main":
        return any(k in p for k in [
            "main", "home", "landing", "hero", "promo",
            "product-grid", "page.tsx", "layout.tsx",
        ])

    if page_type == "product":
        return any(k in p for k in [
            "product", "detail", "gallery", "product-card",
            "page.tsx", "layout.tsx",
        ])

    if page_type == "category":
        return any(k in p for k in [
            "category", "grid", "filter", "page.tsx", "layout.tsx",
        ])

    if page_type == "cart":
        return any(k in p for k in [
            "cart", "checkout", "basket", "order",
            "page.tsx", "layout.tsx",
        ])

    return True


def select_files_from_repo_map(
    repo_map: Dict[str, Any],
    page_type: str,
    fix_type: str,
) -> List[str]:
    """
    Select files from real repo_map.json first.
    This prevents source_context.py from guessing wrong folders.
    """
    selected: List[str] = []

    pages = repo_map.get("pages", [])
    widgets = repo_map.get("widgets", [])
    components = repo_map.get("components", [])
    entities = repo_map.get("entities", [])

    if fix_type in {"image", "layout"}:
        selected += repo_map.get("image_related_files", [])
        selected += [p for p in widgets if path_matches_page(p, page_type)]
        selected += [p for p in pages if path_matches_page(p, page_type)]

    elif fix_type == "javascript":
        selected += repo_map.get("javascript_related_files", [])
        selected += [p for p in pages if path_matches_page(p, page_type)]
        selected += [p for p in widgets if path_matches_page(p, page_type)]
        selected += ["package.json"]

    elif fix_type == "css":
        selected += repo_map.get("styles", [])
        selected += [p for p in pages if path_matches_page(p, page_type)]
        selected += [p for p in widgets if path_matches_page(p, page_type)]

    elif fix_type == "server":
        selected += repo_map.get("config_files", [])
        selected += repo_map.get("server_files", [])
        selected += ["package.json"]

    else:
        selected += [p for p in pages if path_matches_page(p, page_type)]
        selected += [p for p in widgets if path_matches_page(p, page_type)]
        selected += components
        selected += entities

    # remove duplicates while preserving order
    return list(dict.fromkeys(selected))


def list_source_files_fallback(target_root: Path) -> List[Path]:
    files: List[Path] = []

    for path in target_root.rglob("*"):
        if len(files) >= MAX_FILES_TO_SCORE:
            break

        if not path.is_file():
            continue

        if should_ignore_path(path):
            continue

        if path.suffix not in SUPPORTED_EXTENSIONS:
            continue

        files.append(path)

    return files


def get_source_files(
    target_root: Path,
    repo_map: Dict[str, Any],
    page_type: str,
    fix_type: str,
) -> List[Path]:
    """
    Main source selection:
    1. Use repo_map.json selected files
    2. If empty, fallback to full scan
    """
    files: List[Path] = []

    if repo_map:
        selected_relative_files = select_files_from_repo_map(
            repo_map=repo_map,
            page_type=page_type,
            fix_type=fix_type,
        )

        for rel in selected_relative_files:
            candidate = target_root / rel
            if candidate.exists() and candidate.is_file():
                if candidate.suffix in SUPPORTED_EXTENSIONS:
                    files.append(candidate)

    if files:
        return list(dict.fromkeys(files))

    return list_source_files_fallback(target_root)


def score_page_scope(path_text: str, page_type: str) -> int:
    if not page_type:
        return 0

    score = 0

    prefer = PAGE_KEYWORDS.get(page_type, [])
    for token in prefer:
        if token in path_text:
            score += 18

    avoid_map = {
        "main": ["product-detail", "cart", "checkout", "category"],
        "product": ["main-landing", "hero-banner", "promo-banners", "cart", "checkout"],
        "category": ["main-landing", "product-detail", "cart", "checkout"],
        "cart": ["main-landing", "product-detail", "category", "hero-banner"],
    }

    for token in avoid_map.get(page_type, []):
        if token in path_text:
            score -= 25

    return score


def score_fix_type_signals(
    path_text: str,
    content_text: str,
    fix_type: str,
) -> int:
    score = 0

    if fix_type in {"image", "layout"}:
        if "<img" in content_text:
            score += 18
        if "next/image" in content_text:
            score += 16
        if "src=" in content_text and "alt=" in content_text:
            score += 10
        if "width=" in content_text or "height=" in content_text:
            score += 8
        if "hero" in path_text:
            score += 15
        if "banner" in path_text:
            score += 10

    elif fix_type == "javascript":
        if "dynamic(" in content_text or "react.lazy" in content_text:
            score += 16
        if "import(" in content_text:
            score += 12
        if "useeffect" in content_text:
            score += 8
        if "<script" in content_text or "script" in content_text:
            score += 12
        if "analytics" in content_text or "tracker" in content_text:
            score += 12
        if "provider" in path_text or "layout" in path_text:
            score += 14
        if "package.json" in path_text:
            score += 8

    elif fix_type == "css":
        if path_text.endswith(".css"):
            score += 20
        if "@import" in content_text:
            score += 14
        if "font-display" in content_text:
            score += 14
        if "stylesheet" in content_text:
            score += 10
        if "globals" in path_text:
            score += 12

    elif fix_type == "server":
        if "next.config" in path_text:
            score += 30
        if "middleware" in path_text:
            score += 22
        if "package.json" in path_text:
            score += 12
        if "api/" in path_text:
            score += 16
        if "headers" in content_text or "cache-control" in content_text:
            score += 18
        if "rewrites" in content_text or "redirects" in content_text:
            score += 10

    else:
        if "/page-components/" in path_text:
            score += 8
        if "/widgets/" in path_text:
            score += 6
        if "/entities/" in path_text:
            score += 5

    return score


def score_file(
    path: Path,
    content: str,
    keywords: List[str],
    page_type: str,
    fix_type: str,
) -> int:
    score = 0

    path_text = str(path).lower()
    content_text = content.lower()

    score += score_page_scope(path_text, page_type)
    score += score_fix_type_signals(path_text, content_text, fix_type)

    for keyword in keywords:
        keyword = keyword.lower()
        if keyword in path_text:
            score += 6
        if keyword in content_text:
            score += 1

    if "/ui/" in path_text:
        score += 5
    if "/page-components/" in path_text:
        score += 5
    if "/widgets/" in path_text:
        score += 4
    if "/entities/" in path_text:
        score += 3
    if "/app/" in path_text:
        score += 3

    if path.name in {"index.ts", "index.tsx", "index.js", "index.jsx"}:
        score -= 8

    if ("mock" in path_text or "data" in path_text) and fix_type not in {"image", "layout"}:
        score -= 12

    return score


def priority_tokens_for_fix_type(fix_type: str, keywords: List[str]) -> List[str]:
    if fix_type in {"image", "layout"}:
        return [
            "<img", "<image", "next/image", "src=", "alt=",
            "fetchpriority", "loading=", "decoding=",
            "width=", "height=", "aspect-ratio",
        ]

    if fix_type == "javascript":
        return [
            "dynamic(", "import(", "react.lazy", "useeffect",
            "<script", "script", "analytics", "tracker",
            "provider", "heavy",
        ]

    if fix_type == "css":
        return [
            "@import", "font-display", "stylesheet",
            "globals.css", ".css", "classname=", "style=",
        ]

    if fix_type == "server":
        return [
            "next.config", "middleware", "headers",
            "cache-control", "rewrites", "redirects", "cdn",
        ]

    return list(keywords)


def find_important_position(
    content: str,
    keywords: List[str],
    fix_type: str,
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
    fix_type: str,
) -> str:
    if len(content) <= MAX_SNIPPET_CHARS:
        return content

    center = find_important_position(content, keywords, fix_type)

    start = max(0, center - 500)
    end = min(len(content), start + MAX_SNIPPET_CHARS)

    return content[start:end]


def collect_source_context(
    repo_path: str,
    target_dir: str,
    fix_plan: Dict[str, Any],
    max_candidate_files: int = MAX_CANDIDATE_FILES,
    repo_map_path="../repo_map.json",
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

    repo_map = load_repo_map(repo_map_path)

    source_files = get_source_files(
        target_root=target_root,
        repo_map=repo_map,
        page_type=page_type,
        fix_type=fix_type,
    )

    scored_files: List[Dict[str, Any]] = []

    for file_path in source_files:
        content = read_file_limited(file_path)

        if not content:
            continue

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
        "repo_map_used": bool(repo_map),
        "repo_map_path": repo_map_path,
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
        "fix_plan_manual_group_main_decathlon_main_desktop_9_decathlon_main_desktop/repo"
    )

    test_target_dir = "2_digital_twins/active-staging"

    sample_fix_plan = {
        "page_type": "main",
        "device_type": "desktop",
        "affected_metric": "TBT",
        "action": "Defer non-critical JavaScript and remove unused imports to reduce unused JavaScript on the main page for desktop.",
        "problem_summary": "High TBT due to unused JavaScript on the main desktop page.",
        "reasoning": "Unused JavaScript is a significant contributor to TBT.",
        "opportunity": {
            "opportunity_id": "unused-javascript",
            "title": "Reduce unused JavaScript",
            "category": "javascript",
        },
        "risk_details": {
            "failed_metrics": ["performance_score", "LCP", "TBT", "CLS"],
            "page_type": "main",
            "device_type": "desktop",
        },
    }

    result = collect_source_context(
        repo_path=test_repo_path,
        target_dir=test_target_dir,
        fix_plan=sample_fix_plan,
        repo_map_path="repo_map.json",
    )

    print("✅ Source context collected")
    print("Repo map used:", result["repo_map_used"])
    print("Page type:", result["page_type"])
    print("Fix type:", result["fix_type"])
    print("Total selected files:", result["total_source_files"])
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