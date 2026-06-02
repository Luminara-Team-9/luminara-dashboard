"""
patch_generator.py

Production-ready source-aware patch generator for the Luminara Remediation Agent.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

import httpx
from dotenv import load_dotenv
from openai import OpenAI

try:
    from .source_context import collect_source_context, collect_diagnosis_context
except ImportError:
    from source_context import collect_source_context, collect_diagnosis_context


load_dotenv()

QWEN_MODEL = os.getenv(
    "QWEN_MODEL",
    "/abr/coss41/shared_workspace/yuyu_workspace/data/models/qwen32b-int4",
)

QWEN_BASE_URL = os.getenv(
    "QWEN_BASE_URL",
    "http://DIS02:8000/v1",
)

QWEN_API_KEY = os.getenv("QWEN_API_KEY", "dummy")

client = OpenAI(
    base_url=QWEN_BASE_URL,
    api_key=QWEN_API_KEY,
    http_client=httpx.Client(
        trust_env=False,
        timeout=300.0,
    ),
)


class PatchGenerationError(RuntimeError):
    """Raised when patch generation fails."""


def extract_json(raw_text: str) -> Dict[str, Any]:
    if not raw_text:
        raise PatchGenerationError("Empty Qwen response.")

    text = raw_text.strip()

    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()

    def _try_parse(s: str) -> Dict[str, Any]:
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
        # Qwen sometimes emits \' which is invalid JSON — replace with '
        cleaned = s.replace("\\'", "'")
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        raise json.JSONDecodeError("", s, 0)

    try:
        return _try_parse(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise PatchGenerationError(f"No JSON object found in response:\n{text}")

    try:
        return _try_parse(match.group(0))
    except json.JSONDecodeError as e:
        raise PatchGenerationError(f"Failed to parse JSON: {e}\n{text}") from e


def diagnose_with_qwen(
    fix_plan: Dict[str, Any],
    diagnosis_files: List[Dict[str, Any]],
) -> List[str]:
    """
    Phase 1: Ask Qwen which files are causing the performance problem.
    Returns 1-3 file paths. Falls back to [] on any failure.
    """
    if not diagnosis_files:
        return []

    files_text = "\n\n".join(
        f"[{i + 1}] {f['path']}\n{f['signature']}"
        for i, f in enumerate(diagnosis_files)
    )

    opportunity = fix_plan.get("opportunity") or {}

    prompt = (
        f"Lighthouse audit failed:\n"
        f"Opportunity: {opportunity.get('title', '')} ({opportunity.get('opportunity_id', '')})\n"
        f"Page: {fix_plan.get('page_type')} / {fix_plan.get('device_type')}\n"
        f"Problem: {fix_plan.get('problem_summary', '')}\n\n"
        f"Source files in this codebase:\n\n"
        f"{files_text}\n\n"
        f"Which 1-3 files need to be changed to fix this problem?\n"
        f'Return ONLY a JSON array of paths. Example: ["path/a.tsx", "path/b.tsx"]'
    )

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Identify which source files cause a web performance issue. "
                        "Return only a JSON array of file paths."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            max_tokens=200,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.strip("`").strip()
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()

        paths = json.loads(raw)
        if isinstance(paths, list):
            return [str(p) for p in paths[:3] if isinstance(p, str)]

    except Exception as e:
        logger.warning("[diagnose] Phase 1 failed: %s", e)

    return []


def compact_snippet(snippet: str, limit: int = 3500) -> str:
    if len(snippet) <= limit:
        return snippet
    return snippet[:limit] + "\n\n/* ... file truncated ... */"


def _read_full_file(repo_path: str, relative_path: str) -> Optional[str]:
    try:
        return (Path(repo_path) / relative_path).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None


def format_metrics_section(fix_plan: Dict[str, Any]) -> str:
    """
    Build a concise, human-readable performance metrics block for the Qwen prompt.
    Shows actual values vs thresholds so Qwen understands severity, not just symptom.
    """
    metrics = fix_plan.get("metrics") or {}
    if not metrics:
        return ""

    THRESHOLDS = {
        "performance_score": ("≥90",  lambda v: f"{v:.0f}",    lambda v: v < 90),
        "lcp_ms":            ("<2500ms", lambda v: f"{v:,.0f}ms", lambda v: v > 2500),
        "tbt_ms":            ("<200ms",  lambda v: f"{v:,.0f}ms", lambda v: v > 200),
        "cls_score":         ("<0.1",    lambda v: f"{v:.3f}",   lambda v: v > 0.1),
        "fcp_ms":            ("<1800ms", lambda v: f"{v:,.0f}ms", lambda v: v > 1800),
        "ttfb_ms":           ("<800ms",  lambda v: f"{v:,.0f}ms", lambda v: v > 800),
        "inp_ms":            ("<200ms",  lambda v: f"{v:,.0f}ms", lambda v: v > 200),
    }

    METRIC_KEYS = {
        "performance_score": metrics.get("avg_performance"),
        "lcp_ms":            metrics.get("avg_lcp_ms"),
        "tbt_ms":            metrics.get("avg_tbt_ms"),
        "cls_score":         metrics.get("avg_cls_score"),
        "fcp_ms":            metrics.get("fcp_ms"),
        "ttfb_ms":           metrics.get("ttfb_ms"),
        "inp_ms":            metrics.get("inp_ms"),
    }

    lines = []
    failed_metrics_lower = {m.lower() for m in (metrics.get("failed_metrics") or [])}

    KEY_TO_METRIC_NAME = {
        "performance_score": "performance_score",
        "lcp_ms": "lcp",
        "tbt_ms": "tbt",
        "cls_score": "cls",
        "fcp_ms": "fcp",
        "ttfb_ms": "ttfb",
        "inp_ms": "inp",
    }

    for key, value in METRIC_KEYS.items():
        if value is None:
            continue
        threshold_label, fmt, is_failing = THRESHOLDS[key]
        status = "FAIL" if is_failing(value) else "ok"
        metric_name = KEY_TO_METRIC_NAME.get(key, key)
        marker = "  <-- FAILING" if metric_name in failed_metrics_lower else ""
        lines.append(f"  {key:<20} {fmt(value):<12} [threshold: {threshold_label}]  {status}{marker}")

    if not lines:
        return ""

    page = fix_plan.get("page_type", "")
    device = fix_plan.get("device_type", "")
    run_count = metrics.get("run_count", "?")
    header = f"Measured performance ({run_count} runs, {device}/{page}):"
    return header + "\n" + "\n".join(lines)


def build_source_context_text(source_context: Dict[str, Any]) -> str:
    parts = []
    candidate_files = source_context.get("candidate_files", [])[:3]

    # Keep total source context under ~7500 chars so the full prompt
    # stays within Qwen's 8192 token limit (input + 1500 output).
    # 3 files → 2500 chars each; 2 files → 3500; 1 file → 5000.
    n = max(len(candidate_files), 1)
    per_file_limit = min(5000, max(2500, 7500 // n))

    for i, item in enumerate(candidate_files, 1):
        parts.append(
            f"""
[SOURCE_FILE_{i}]
path: {item["path"]}
score: {item["score"]}
fix_type: {item.get("fix_type", source_context.get("fix_type", "unknown"))}

```tsx
{compact_snippet(item["snippet"], limit=per_file_limit)}
```
"""
        )

    return "\n".join(parts)


def build_patch_prompt(
    fix_plan: Dict[str, Any],
    source_context: Dict[str, Any],
    rag_context: str = "",
) -> str:
    source_context_text = build_source_context_text(source_context)

    rag_section = ""
    if rag_context and rag_context.strip():
        rag_section = f"""
--- Knowledge base (RAG fix guides for this problem) ---
{rag_context.strip()}
---
"""

    metrics_section = format_metrics_section(fix_plan)
    metrics_block = f"\nCurrent metrics:\n{metrics_section}\n" if metrics_section else ""

    return f"""You are a web performance optimization expert for a Korean e-commerce platform.

You are given a Lighthouse performance problem, relevant fix guides, and the actual
source code from the repository. Study the fix guides and source code carefully,
then generate the best possible code patch to fix this specific performance issue.
{metrics_block}{rag_section}
Fix Plan:
{json.dumps(fix_plan, indent=2, ensure_ascii=False, default=str)}

Source code:
{source_context_text}

Return ONLY this JSON (no markdown, no extra text):

{{
  "auto_applicable": true,
  "patches": [
    {{
      "target_file": "exact path copied from SOURCE_FILE above",
      "original_code": "exact verbatim code snippet from the source to replace",
      "suggested_code": "your improved replacement — must be valid TypeScript/JS",
      "change_type": "code_replace",
      "change_reason": "one sentence: what this changes and why it helps performance"
    }},
    {{
      "target_file": "another file if the fix requires changes in multiple places",
      "original_code": "exact verbatim snippet",
      "suggested_code": "improved replacement",
      "change_type": "code_replace",
      "change_reason": "why this second change is needed"
    }}
  ],
  "manual_review_reason": null
}}

You may include multiple patches if the fix requires changes across multiple files.
Only include a file if you have its exact source code above — do not invent file paths.

If no code change in the provided source files can meaningfully fix this issue:

{{
  "auto_applicable": false,
  "patches": [],
  "manual_review_reason": "brief explanation"
}}
"""


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).lower()


def classify_fix_type(fix_plan: Dict[str, Any]) -> str:
    opportunity = fix_plan.get("opportunity") or {}

    text = " ".join([
        normalize_text(fix_plan.get("affected_metric")),
        normalize_text(fix_plan.get("action")),
        normalize_text(fix_plan.get("reasoning")),
        normalize_text(fix_plan.get("problem_summary")),
        normalize_text(opportunity.get("opportunity_id")),
        normalize_text(opportunity.get("title")),
        normalize_text(opportunity.get("description")),
        normalize_text(opportunity.get("category")),
    ])

    if any(k in text for k in [
        "server-response", "server response", "ttfb", "time to first byte",
        "redis", "memcached", "cdn", "cache-control", "backend", "server-side",
    ]):
        return "server"

    if any(k in text for k in [
        "unused-javascript", "legacy-javascript", "javascript", " js ",
        "tbt", "total blocking time", "main thread", "bootup", "script",
        "third-party", "bundle",
    ]):
        return "javascript"

    if any(k in text for k in [
        "render-blocking", "css", "stylesheet", "fcp",
        "first contentful paint", "font-display", "@import",
    ]):
        return "css"

    if any(k in text for k in [
        "cls", "layout shift", "cumulative layout shift", "aspect-ratio",
    ]):
        return "layout"

    if any(k in text for k in [
        "prioritize-lcp-image", "largest contentful paint", "lcp", "image",
        "img", "next-gen", "offscreen", "properly size", "responsive images",
        "webp", "avif",
    ]):
        return "image"

    return "unknown"


def classify_patch_type(patch: Dict[str, Any]) -> str:
    text = "\n".join([
        normalize_text(patch.get("target_file")),
        normalize_text(patch.get("original_code")),
        normalize_text(patch.get("suggested_code")),
        normalize_text(patch.get("change_reason")),
    ])

    if any(k in text for k in [
        "<img", "<image", "next/image", "fetchpriority", "loading=",
        "decoding=", "srcset", "sizes=", "priority",
    ]):
        return "image"

    if any(k in text for k in [
        "dynamic(", "import(", "react.lazy", "defer", "async", "<script",
        "script ", "remove unused", "lazy import", "useeffect",
        "requestidlecallback", "settimeout", "swetrix", "trackviews", "init(",
        "strategy=", 'strategy="lazyonload"', "lazyonload", "afterinteractive",
    ]):
        return "javascript"

    if any(k in text for k in [
        ".css", "stylesheet", "@import", "font-display", "media=\"print\"",
        "rel=\"preload\"", "rel='preload'", "classname", "style=",
        "display=swap", "font-display:", "fonts.googleapis",
        "next/font", "display: 'swap'", 'display: "swap"',
        "display:'swap'", 'display:"swap"',
    ]):
        return "css"

    if any(k in text for k in [
        "cache-control", "redis", "memcached", "cdn", "server", "headers()",
        "next.config", "middleware",
    ]):
        return "server"

    if any(k in text for k in [
        "width=", "height=", "aspect-ratio", "min-height",
    ]):
        return "layout"

    return "unknown"


def patch_matches_fix_type(fix_type: str, patch: Dict[str, Any]) -> bool:
    patch_type = classify_patch_type(patch)

    if fix_type == "server":
        return patch_type == "server"

    if fix_type == "image":
        return patch_type in {"image", "layout"}

    if fix_type == "javascript":
        # Allow css-type patches (e.g. font-display optimization) for JS opportunities
        # since font loading directly affects TBT/rendering time.
        return patch_type in {"javascript", "css"}

    if fix_type == "css":
        return patch_type == "css"

    if fix_type == "layout":
        return patch_type in {"layout", "image", "css"}

    return False


def has_placeholder_content(patch: Dict[str, Any]) -> bool:
    text = "\n".join([
        normalize_text(patch.get("target_file")),
        normalize_text(patch.get("original_code")),
        normalize_text(patch.get("suggested_code")),
    ])

    unsafe_tokens = [
        "/path/to", "example", "todo", "placeholder", "heroimage.tsx",
        "src/components/productdetail", "your-image", "image.jpg",
        "hero.jpg", "lorem ipsum",
        "consider ", "maybe ", "should ", "you can ", "recommended ",
    ]

    return any(token in text for token in unsafe_tokens)


def allowed_target_prefix(source_context: Dict[str, Any]) -> Optional[str]:
    target_dir = source_context.get("target_dir")

    if not target_dir:
        return None

    prefix = str(target_dir).strip().strip("/")
    if not prefix:
        return None

    return prefix + "/"


def is_safe_repo_relative_path(
    target_file: str,
    source_context: Optional[Dict[str, Any]] = None,
) -> bool:
    if not target_file:
        return False

    path = Path(target_file)

    if path.is_absolute():
        return False

    if ".." in path.parts:
        return False

    if source_context:
        prefix = allowed_target_prefix(source_context)
        if prefix and not str(target_file).startswith(prefix):
            return False

    return True


def looks_like_real_code_block(
    original_code: str,
    fix_type: str = "unknown",
) -> bool:
    if not original_code:
        return False

    text = original_code.strip()
    lower = text.lower()

    if lower.startswith("http://") or lower.startswith("https://"):
        return False

    if len(text) < 20 and "<" not in text and "=" not in text and "{" not in text:
        return False

    common_code_markers = [
        "return (", "const ", "let ", "var ", "function ", "export ",
        "import ", "classname=", "style=",
    ]

    if any(marker in lower for marker in common_code_markers):
        return True

    if fix_type in {"image", "layout"}:
        return any(marker in lower for marker in [
            "<img", "<image", "next/image", "src=", "alt=",
            "width=", "height=", "aspect-ratio",
        ])

    if fix_type == "javascript":
        return any(marker in lower for marker in [
            "dynamic(", "import(", "react.lazy", "useeffect", "<script",
            "script", "async", "defer",
            "swetrix", "trackviews", "init(", "requestidlecallback", "settimeout",
        ])

    if fix_type == "css":
        return any(marker in lower for marker in [
            "{", "}", "@import", "font-display", "stylesheet", ".css",
            "classname=", "style=",
        ])

    if fix_type == "server":
        return any(marker in lower for marker in [
            "headers", "cache-control", "next.config", "middleware",
            "rewrites", "redirects", "module.exports", "export default",
        ])

    return any(marker in lower for marker in common_code_markers)

def unsafe_import_removal_without_usage_removal(patch: Dict[str, Any]) -> bool:
    original = patch.get("original_code") or ""
    suggested = patch.get("suggested_code") or ""

    removed_imports = []

    for line in original.splitlines():
        stripped = line.strip()

        if not stripped.startswith("import "):
            continue

        if stripped in suggested:
            continue

        match = re.search(r"import\s+\{\s*([^}]+)\s*\}", stripped)
        if not match:
            continue

        imported_names = [
            name.strip().split(" as ")[-1].strip()
            for name in match.group(1).split(",")
        ]

        removed_imports.extend(imported_names)

    if not removed_imports:
        return False

    for name in removed_imports:
        jsx_usage = f"<{name}"
        normal_usage = f"{name}("

        if jsx_usage in original and jsx_usage in suggested:
            return True

        if normal_usage in original and normal_usage in suggested:
            return True

    return False

def unsafe_dynamic_without_import(patch: Dict[str, Any]) -> bool:
    original = patch.get("original_code") or ""
    suggested = patch.get("suggested_code") or ""

    uses_dynamic = "dynamic(" in suggested

    has_dynamic_import = (
        "import dynamic from 'next/dynamic'" in original
        or 'import dynamic from "next/dynamic"' in original
        or "import dynamic from 'next/dynamic'" in suggested
        or 'import dynamic from "next/dynamic"' in suggested
    )

    return uses_dynamic and not has_dynamic_import

def unsafe_partial_dynamic_refactor(patch: Dict[str, Any]) -> bool:
    original = patch.get("original_code") or ""
    suggested = patch.get("suggested_code") or ""

    if "dynamic(" not in suggested:
        return False

    # Script strategy changes do not use dynamic() — skip this check.
    if "strategy=" in original or "strategy=" in suggested:
        return False

    has_imports = "import " in original
    has_jsx = "<" in original and "/>" in original

    if has_imports and not has_jsx:
        # Default import → dynamic() is always safe: the component name is preserved
        is_default_import_only = all(
            bool(re.match(r"import\s+\w+\s+from\s+['\"]", line.strip()))
            or not line.strip().startswith("import ")
            for line in original.splitlines()
            if line.strip()
        )
        if is_default_import_only:
            return False

        # Named import → dynamic() is safe IF every removed named component
        # is redeclared as a const in suggested_code.
        # e.g. import { ChatWidget } from '...' → const ChatWidget = dynamic(...)
        for line in original.splitlines():
            stripped = line.strip()
            if not stripped.startswith("import "):
                continue
            if stripped in suggested:
                continue  # import kept unchanged — fine
            match = re.search(r"import\s+\{([^}]+)\}", stripped)
            if match:
                names = [
                    n.strip().split(" as ")[-1].strip()
                    for n in match.group(1).split(",")
                ]
                for name in names:
                    if f"const {name}" not in suggested and f"import {name}" not in suggested:
                        return True  # name lost without redeclaration — unsafe
        return False

    return False

def validate_patch_against_context(
    patch_result: Dict[str, Any],
    source_context: Dict[str, Any],
    fix_plan: Dict[str, Any],
) -> Dict[str, Any]:
    patches = patch_result.get("patches", [])

    if not patch_result.get("auto_applicable") or not patches:
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": patch_result.get(
                "manual_review_reason",
                "Patch generator returned no auto-applicable patch.",
            ),
        }

    source_by_path = {
        item["path"]: item
        for item in source_context.get("candidate_files", [])
    }

    fix_type = source_context.get("fix_type") or classify_fix_type(fix_plan)
    valid_patches = []

    for patch in patches:
        if not isinstance(patch, dict):
            continue

        target_file = patch.get("target_file")
        original_code = patch.get("original_code")
        suggested_code = patch.get("suggested_code")

        if has_placeholder_content(patch):
            logger.info("[validate_context] REJECT target=%s: placeholder content", target_file)
            continue

        if unsafe_import_removal_without_usage_removal(patch):
            logger.info("[validate_context] REJECT target=%s: unsafe import removal without usage removal", target_file)
            continue

        if unsafe_dynamic_without_import(patch):
            logger.info("[validate_context] REJECT target=%s: dynamic() used without import dynamic", target_file)
            continue

        if unsafe_partial_dynamic_refactor(patch):
            logger.info("[validate_context] REJECT target=%s: partial dynamic refactor (import-only, no JSX)", target_file)
            continue

        if not is_safe_repo_relative_path(target_file, source_context):
            logger.info("[validate_context] REJECT target=%s: unsafe or out-of-prefix path", target_file)
            continue

        patch_type = classify_patch_type(patch)
        if not patch_matches_fix_type(fix_type, patch):
            logger.info("[validate_context] REJECT target=%s: patch_type=%s does not match fix_type=%s", target_file, patch_type, fix_type)
            continue

        if not target_file or target_file not in source_by_path:
            logger.info("[validate_context] REJECT target=%s: not in source_by_path candidates", target_file)
            continue

        if not original_code or not suggested_code:
            logger.info("[validate_context] REJECT target=%s: missing original_code or suggested_code", target_file)
            continue

        if not looks_like_real_code_block(original_code, fix_type):
            logger.info("[validate_context] REJECT target=%s: original_code does not look like real code", target_file)
            continue

        if original_code.strip() == suggested_code.strip():
            logger.info("[validate_context] REJECT target=%s: original_code == suggested_code (no change)", target_file)
            continue

        # Fix common Qwen mistakes: HTML attribute names → React camelCase
        _REACT_ATTR_FIXES = {
            " srcset=": " srcSet=",
            "\tsrcset=": "\tsrcSet=",
            "\nsrcset=": "\nsrcSet=",
            " crossorigin=": " crossOrigin=",
            " tabindex=": " tabIndex=",
            " readonly=": " readOnly=",
            " classname=": " className=",
            " nomodule=": " noModule=",
            " autofocus=": " autoFocus=",
            " autoplay=": " autoPlay=",
            "fetchpriority=": "fetchPriority=",
        }
        for wrong, right in _REACT_ATTR_FIXES.items():
            suggested_code = suggested_code.replace(wrong, right)

        # If suggested_code has multiple top-level JSX elements without a wrapper,
        # wrap them in a React fragment so JSX is valid.
        def _count_top_level_jsx(code: str) -> int:
            stripped = code.strip()
            count = 0
            depth = 0
            i = 0
            while i < len(stripped):
                if stripped[i] == '<' and i + 1 < len(stripped) and stripped[i+1] not in ('/', '!', ' '):
                    if depth == 0:
                        count += 1
                    depth += 1
                elif stripped[i:i+2] == '/>':
                    depth = max(0, depth - 1)
                    i += 1
                elif stripped[i:i+2] == '</' :
                    depth = max(0, depth - 1)
                i += 1
            return count

        if _count_top_level_jsx(suggested_code) > 1:
            indent = len(suggested_code) - len(suggested_code.lstrip())
            pad = " " * indent
            suggested_code = f"{pad}<>\n{suggested_code}\n{pad}</>"

        valid_patches.append(
            {
                "target_file": target_file,
                "original_code": original_code,
                "suggested_code": suggested_code,
                "change_type": patch.get("change_type", "code_replace"),
                "change_reason": patch.get(
                    "change_reason",
                    "Source-aware performance optimization patch.",
                ),
            }
        )

    if not valid_patches:
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": (
                f"Generated patch was rejected because it did not pass source-aware validation. "
                f"Detected fix_type='{fix_type}'. The patch may have used an unsafe path, "
                f"placeholder code, invalid original_code, or a patch type that does not match "
                f"the selected Lighthouse opportunity."
            ),
        }

    return {
        "auto_applicable": True,
        "patches": valid_patches,
        "manual_review_reason": None,
    }


def _import_removal_leaves_dangling_usages(patch: Dict[str, Any], full_content: str) -> bool:
    """
    Returns True if the patch removes/comments-out an import but the imported
    names are still referenced elsewhere in the full file.
    Only the patch snippet is checked by normalize_auto_patch_fix — that misses
    usages outside the snippet. This check uses the real file content.
    """
    original = (patch.get("original_code") or "").strip()
    suggested = (patch.get("suggested_code") or "").strip()

    if "import " not in original:
        return False

    removed_names = []
    for line in original.splitlines():
        stripped = line.strip()
        if not stripped.startswith("import "):
            continue
        if stripped in suggested:
            continue
        named_match = re.search(r"import\s+\{([^}]+)\}", stripped)
        if named_match:
            for part in named_match.group(1).split(","):
                name = part.strip().split(" as ")[-1].strip()
                if name:
                    removed_names.append(name)
        else:
            default_match = re.match(r"import\s+(\w+)\s+from", stripped)
            if default_match:
                name = default_match.group(1)
                if name and name not in suggested:
                    removed_names.append(name)

    if not removed_names:
        return False

    # Remove the original import lines from content so we don't count the import as a self-usage
    content_without_original = full_content
    for line in original.splitlines():
        content_without_original = content_without_original.replace(line + "\n", "").replace(line, "")

    for name in removed_names:
        if f"<{name}" in content_without_original or f"{name}(" in content_without_original:
            return True

    return False


def validate_patch_against_files(
    patch_result: Dict[str, Any],
    repo_path: str,
    source_context: Optional[Dict[str, Any]] = None,
    fix_plan: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not patch_result.get("auto_applicable"):
        return patch_result

    repo_root = Path(repo_path).resolve()
    valid_patches = []

    fix_type = "unknown"
    if source_context:
        fix_type = source_context.get("fix_type") or "unknown"
    if fix_type == "unknown" and fix_plan:
        fix_type = classify_fix_type(fix_plan)

    for patch in patch_result.get("patches", []):
        target_file = patch.get("target_file")
        original_code = patch.get("original_code")
        suggested_code = patch.get("suggested_code")

        if has_placeholder_content(patch):
            continue

        if not is_safe_repo_relative_path(target_file, source_context):
            continue

        # Reject: replacing a module import statement with JSX — invalid syntax.
        # e.g. import './globals.css' → <link rel='stylesheet' .../>
        _orig_stripped = (original_code or "").strip()
        _sug_stripped = (suggested_code or "").strip()
        if (
            (_orig_stripped.startswith("import '") or _orig_stripped.startswith('import "'))
            and _sug_stripped.lstrip("/ \n").startswith("<")
        ):
            logger.info("[validate_files] REJECT target=%s: import statement replaced with JSX", target_file)
            continue

        if not target_file or not original_code or not suggested_code:
            continue

        if not looks_like_real_code_block(original_code, fix_type):
            continue

        file_path = (repo_root / target_file).resolve()

        if not file_path.exists():
            logger.info("[validate_files] REJECT target=%s: file not found in repo at %s", target_file, file_path)
            continue

        if not str(file_path).startswith(str(repo_root)):
            logger.info("[validate_files] REJECT target=%s: path escapes repo root", target_file)
            continue

        content = file_path.read_text(encoding="utf-8", errors="ignore")

        if _import_removal_leaves_dangling_usages(patch, content):
            logger.info(
                "[validate_files] REJECT target=%s: import removed but names still used in full file",
                target_file,
            )
            continue

        # Fix HTML attribute names → React camelCase before matching/storing
        _REACT_ATTR_FIXES = {
            " srcset=": " srcSet=",
            "\tsrcset=": "\tsrcSet=",
            "\nsrcset=": "\nsrcSet=",
            " crossorigin=": " crossOrigin=",
            " tabindex=": " tabIndex=",
            " readonly=": " readOnly=",
            " classname=": " className=",
            " nomodule=": " noModule=",
            " autofocus=": " autoFocus=",
            " autoplay=": " autoPlay=",
            "fetchpriority=": "fetchPriority=",
        }
        for _wrong, _right in _REACT_ATTR_FIXES.items():
            suggested_code = suggested_code.replace(_wrong, _right)

        # Exact match first
        if original_code in content:
            valid_patches.append({**patch, "suggested_code": suggested_code})
            continue

        # Fuzzy match: strip trailing whitespace per line (Qwen often adds/removes trailing spaces)
        norm_original_lines = [l.rstrip() for l in original_code.splitlines()]
        content_lines = content.splitlines()
        n_search = len(norm_original_lines)
        actual_original = None
        for i in range(len(content_lines) - n_search + 1):
            window = content_lines[i:i + n_search]
            if [l.rstrip() for l in window] == norm_original_lines:
                actual_original = "\n".join(window)
                break

        if actual_original is None:
            logger.info(
                "[validate_files] REJECT target=%s: original_code not found in file (first 200 chars: %r)",
                target_file,
                (original_code or "")[:200],
            )
            continue

        # Use the exact text from the file so apply_patch can do a clean replace
        valid_patches.append({**patch, "original_code": actual_original, "suggested_code": suggested_code})

    if not valid_patches:
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": (
                "Generated patch was rejected because original_code was not found "
                "in the actual cloned source file or failed final file validation."
            ),
        }

    return {
        "auto_applicable": True,
        "patches": valid_patches,
        "manual_review_reason": None,
    }


# Lighthouse opportunity IDs that cannot be auto-patched from static source code.
# These require runtime analysis, infrastructure changes, or build config — not code edits.
NON_AUTO_PATCHABLE_OPPORTUNITIES: Dict[str, str] = {
    # unused-javascript: AI will try Script strategy and dynamic import approach instead.
    # unused-css-rules: AI will try font-display and Google Fonts optimization instead.
    # server-response-time: AI will try Cache-Control in next.config.js instead.
    # These are NOT blocked — Qwen will attempt the safe static strategies above.
    "legacy-javascript": (
        "Removing legacy JavaScript polyfills requires updating build configuration "
        "(browserslist, Babel/SWC targets) — not patchable as source code.\n"
        "Developer action: Update .browserslistrc or next.config.js transpile targets."
    ),
    "bootup-time": (
        "Reducing JavaScript bootup time requires runtime profiling to identify which "
        "specific scripts are slow. Static analysis cannot pinpoint the bottleneck.\n"
        "Developer action: Use Chrome DevTools Performance tab, then defer or remove "
        "the identified heavy scripts."
    ),
    "third-party-summary": (
        "Third-party script optimization requires a manual audit of which scripts are "
        "necessary and which can be deferred, removed, or self-hosted.\n"
        "Developer action: Audit all third-party scripts and configure non-critical "
        "ones to load asynchronously or be removed."
    ),
    "third-party-facades": (
        "Implementing third-party facades requires replacing embedded widgets with "
        "lazy-loaded placeholder components — a significant change needing careful review.\n"
        "Developer action: Replace third-party embeds with facade components "
        "using next/dynamic."
    ),
    "total-byte-weight": (
        "Reducing total page weight requires identifying the largest resources from a "
        "runtime network waterfall. The specific files to optimize depend on actual "
        "network load order.\n"
        "Developer action: Review the Lighthouse network waterfall and optimize the "
        "largest transfered resources first."
    ),
}


def _classify_patch_failure(patches: List[Dict[str, Any]]) -> str:
    """Determine why patches failed validation."""
    for patch in patches:
        orig = (patch.get("original_code") or "").strip()
        sug = (patch.get("suggested_code") or "").strip()
        if (
            (orig.startswith("import '") or orig.startswith('import "'))
            and sug.lstrip("/ \n").startswith("<")
        ):
            return "import_replaced_with_jsx"
    return "original_code_not_found"


def _retry_patch(
    failed_patches: List[Dict[str, Any]],
    full_source_context: Dict[str, Any],
    fix_plan: Dict[str, Any],
    repo_path: str,
    source_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Targeted retry: tells Qwen exactly what constraint it violated,
    shows the actual file, and lets it reason about a valid fix itself.
    """
    content_by_path = {
        item["path"]: item.get("snippet", "")
        for item in full_source_context.get("candidate_files", [])
    }

    failure_type = _classify_patch_failure(failed_patches)

    file_sections = []
    seen_paths: set = set()
    for patch in failed_patches:
        target = patch.get("target_file", "")
        if target in seen_paths:
            continue
        seen_paths.add(target)
        # Use full file content so Qwen sees exactly what is there to change
        content = _read_full_file(repo_path, target) or content_by_path.get(target) or ""
        if content:
            file_sections.append(
                f"[ACTUAL CONTENT OF {target}]\n```tsx\n{compact_snippet(content, limit=2500)}\n```"
            )

    if not file_sections:
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": "Retry skipped: file content unavailable.",
        }

    if failure_type == "import_replaced_with_jsx":
        constraint_explanation = (
            "Your patch was rejected. You replaced a JavaScript module import statement "
            "with JSX markup — these are syntactically incompatible constructs. "
            "A module import must remain a module import; it cannot become an HTML/JSX element.\n\n"
            "Rejected patches:\n" + "\n".join(
                f'  original_code: {(p.get("original_code") or "")[:80]}\n'
                f'  suggested_code: {(p.get("suggested_code") or "")[:80]}'
                for p in failed_patches
            ) + "\n\n"
            "Study the actual file content below. Find a different piece of code that "
            "can be validly changed to fix the performance issue."
        )
    else:
        constraint_explanation = (
            "Your patch was rejected because the `original_code` you wrote does not "
            "exist verbatim in the file.\n\n"
            "What you tried:\n" + "\n".join(
                f'  File: {p.get("target_file", "")}\n'
                f'  original_code: "{(p.get("original_code") or "")[:200]}"\n'
                f'  → NOT found in the file — likely a whitespace or formatting mismatch.'
                for p in failed_patches
            ) + "\n\n"
            "Look at the actual file content below and copy-paste the exact string "
            "you want to change, character for character."
        )

    retry_prompt = (
        constraint_explanation + "\n\n"
        "Actual file content(s):\n\n" + "\n\n".join(file_sections) + "\n\n"
        "Generate a corrected patch. Return ONLY the JSON."
    )

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate safe code patches only from provided source snippets. "
                        "Return one compact JSON object only. No markdown. "
                        "Include at most 3 patches. Keep each change_reason under 15 words."
                    ),
                },
                {"role": "user", "content": retry_prompt},
            ],
            temperature=0.0,
            max_tokens=2000,
        )
        raw_retry = response.choices[0].message.content
        retry_result = extract_json(raw_retry)
        logger.info("[patch_generator] Retry Qwen output parsed, auto_applicable=%s", retry_result.get("auto_applicable"))
        return validate_patch_against_files(
            patch_result=retry_result,
            repo_path=repo_path,
            source_context=source_context,
            fix_plan=fix_plan,
        )
    except Exception as e:
        logger.warning("[patch_generator] Retry failed: %s", e)
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": f"Retry failed: {e}",
        }


def generate_patch_from_source(
    fix_plan: Dict[str, Any],
    source_context: Dict[str, Any],
    repo_path: str,
    rag_context: str = "",
) -> Dict[str, Any]:
    opportunity = fix_plan.get("opportunity") or {}
    lighthouse_opp_id = str(opportunity.get("opportunity_id") or "").strip()

    # Always write entry marker so we can see the function was called and which path it takes.
    try:
        import datetime as _dt
        _debug_path = Path("/tmp/qwen_patch_debug.log")
        with open(_debug_path, "a", encoding="utf-8") as _f:
            _f.write(
                f"\n{'='*60}\n"
                f"ENTER  time={_dt.datetime.now().isoformat()}  "
                f"fix_plan_id={fix_plan.get('id')}  opp_id={lighthouse_opp_id}  "
                f"fix_type={source_context.get('fix_type')}  "
                f"qwen_url={QWEN_BASE_URL}  "
                f"rag_context_len={len(rag_context)}\n"
            )
    except Exception:
        pass

    non_patchable_reason = NON_AUTO_PATCHABLE_OPPORTUNITIES.get(lighthouse_opp_id)
    if non_patchable_reason:
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": non_patchable_reason,
        }

    # Also block server fix_type as a catch-all (even if opportunity_id is unknown).
    fix_type = source_context.get("fix_type") or classify_fix_type(fix_plan)
    if fix_type == "server":
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": (
                "Server/infrastructure optimization cannot be automated through frontend "
                "source code patches. This requires CDN configuration, cache headers, "
                "or server-side caching setup.\n"
                "Developer action: Configure Cache-Control headers in next.config.js "
                "headers() function or implement Redis/Memcached at the server level."
            ),
        }

    if not source_context.get("candidate_files"):
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": "No source context candidates were found.",
        }

    # ── Phase 1: Diagnose which files are causing the problem ────────────────
    # Qwen sees all related files (path + 8-line signature) and picks 1-3.
    target_dir = source_context.get("target_dir", "")
    diagnosis_files = collect_diagnosis_context(
        repo_path=repo_path,
        target_dir=target_dir,
        fix_plan=fix_plan,
    )
    diagnosed_paths = diagnose_with_qwen(fix_plan, diagnosis_files)
    logger.info("[patch_generator] Phase 1 diagnosed: %s", diagnosed_paths)

    try:
        _debug_path = Path("/tmp/qwen_patch_debug.log")
        with open(_debug_path, "a", encoding="utf-8") as _f:
            _f.write(f"PHASE1 diagnosed={diagnosed_paths}\n")
    except Exception:
        pass

    # ── Phase 2: Load full content of diagnosed files ─────────────────────
    # If Phase 1 succeeded, use those specific files. Otherwise fall back to
    # the existing heuristic-scored candidates.
    if diagnosed_paths:
        phase2_candidates = []
        for path in diagnosed_paths:
            full_content = _read_full_file(repo_path, path)
            if full_content:
                phase2_candidates.append({
                    "path": path,
                    "score": 100,
                    "fix_type": source_context.get("fix_type", "unknown"),
                    "snippet": full_content,
                })
        if phase2_candidates:
            full_source_context = {**source_context, "candidate_files": phase2_candidates}
            logger.info("[patch_generator] Phase 2 using %d diagnosed files", len(phase2_candidates))
        else:
            # Diagnosis returned paths that don't exist in repo — fall back
            logger.warning("[patch_generator] Diagnosed paths not found in repo, falling back")
            full_source_context = {**source_context, "candidate_files": [
                {**c, "snippet": _read_full_file(repo_path, c["path"]) or c.get("snippet", "")}
                for c in source_context.get("candidate_files", [])
            ]}
    else:
        # Phase 1 failed — fall back to heuristic candidates with full content
        full_source_context = {**source_context, "candidate_files": [
            {**c, "snippet": _read_full_file(repo_path, c["path"]) or c.get("snippet", "")}
            for c in source_context.get("candidate_files", [])
        ]}

    prompt = build_patch_prompt(
        fix_plan=fix_plan,
        source_context=full_source_context,
        rag_context=rag_context,
    )

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate safe code patches only from provided source snippets. "
                        "Return one compact JSON object only. No markdown. "
                        "Include at most 3 patches. Keep each change_reason under 15 words."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.1,
            max_tokens=2500,
        )

        raw = response.choices[0].message.content
        logger.info("[patch_generator] Qwen raw output:\n%s", raw)

        # Write to a debug file so it's always visible regardless of logging config
        try:
            import datetime as _dt
            _debug_path = Path("/tmp/qwen_patch_debug.log")
            with open(_debug_path, "a", encoding="utf-8") as _f:
                _f.write(f"\n{'='*60}\n")
                _f.write(f"time={_dt.datetime.now().isoformat()}  fix_plan_id={fix_plan.get('id')}\n")
                _f.write(f"fix_type={source_context.get('fix_type')}  opp_id={lighthouse_opp_id}\n")
                _f.write(f"RAW QWEN OUTPUT:\n{raw}\n")
        except Exception:
            pass

        raw_patch_result = extract_json(raw)

        # Reject patches for files Qwen was not shown — it invented those paths.
        if raw_patch_result.get("auto_applicable") and raw_patch_result.get("patches"):
            shown_paths = {item["path"] for item in full_source_context.get("candidate_files", [])}
            valid = [p for p in raw_patch_result["patches"] if p.get("target_file") in shown_paths]
            rejected = [p.get("target_file") for p in raw_patch_result["patches"] if p.get("target_file") not in shown_paths]
            if rejected:
                logger.info("[patch_generator] Rejected %d unseen-file patches: %s", len(rejected), rejected)
            if valid:
                raw_patch_result = {**raw_patch_result, "patches": valid}
            else:
                raw_patch_result = {
                    "auto_applicable": False,
                    "patches": [],
                    "manual_review_reason": "All patches targeted files not shown to Qwen — likely hallucinated paths.",
                }

    except Exception as e:
        try:
            _debug_path = Path("/tmp/qwen_patch_debug.log")
            with open(_debug_path, "a", encoding="utf-8") as _f:
                _f.write(f"QWEN_ERROR: {e}\n")
        except Exception:
            pass
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": f"Qwen patch generation failed: {e}",
        }

    # Skip rule-based context validation — let Qwen reason freely.
    # Only run the factual file check: does the file exist and is original_code in it?
    patch_result = validate_patch_against_files(
        patch_result=raw_patch_result,
        repo_path=repo_path,
        source_context=source_context,
        fix_plan=fix_plan,
    )

    # Retry once if Qwen intended a patch but original_code wasn't found in the file.
    # Send Qwen the actual file content so it can copy-paste the exact string.
    if (
        raw_patch_result.get("auto_applicable")
        and raw_patch_result.get("patches")
        and not patch_result.get("auto_applicable")
    ):
        logger.info("[patch_generator] Validation failed — retrying with actual file content")
        retry_result = _retry_patch(
            failed_patches=raw_patch_result["patches"],
            full_source_context=full_source_context,
            fix_plan=fix_plan,
            repo_path=repo_path,
            source_context=source_context,
        )
        if retry_result.get("auto_applicable"):
            logger.info("[patch_generator] Retry succeeded")
            patch_result = retry_result
        else:
            logger.info("[patch_generator] Retry also failed: %s", retry_result.get("manual_review_reason"))

    logger.info("[patch_generator] final result: auto_applicable=%s reason=%s",
                patch_result.get("auto_applicable"), patch_result.get("manual_review_reason"))

    try:
        import datetime as _dt
        _debug_path = Path("/tmp/qwen_patch_debug.log")
        with open(_debug_path, "a", encoding="utf-8") as _f:
            _f.write(f"FINAL: auto_applicable={patch_result.get('auto_applicable')}  "
                     f"reason={patch_result.get('manual_review_reason')}\n")
    except Exception:
        pass

    return patch_result


if __name__ == "__main__":
    test_repo_path = (
        "/abr/coss41/Luminara_App/Agent_Workspace/"
        "fix_plan_manual_group_main_decathlon_main_desktop_9_decathlon_main_desktop/repo"
    )

    test_target_dir = "2_digital_twins/active-staging"

    sample_fix_plan = {
        "id": 999,
        "test_id": 69,
        "page_type": "main",
        "device_type": "desktop",
        "affected_metric": "TBT",
        "action": "Defer non-critical JavaScript and reduce unused JavaScript on the main page.",
        "problem_summary": "High TBT due to unused JavaScript on the main desktop page.",
        "reasoning": "Third-party tracking and globally loaded widgets can block the main thread.",
        "estimated_improvement": 466,
        "opportunity": {
            "opportunity_id": "unused-javascript",
            "title": "Reduce unused JavaScript",
            "category": "javascript",
        },
    }

    source_context = collect_source_context(
        repo_path=test_repo_path,
        target_dir=test_target_dir,
        fix_plan=sample_fix_plan,
        repo_map_path="../repo_map.json",
    )

    result = generate_patch_from_source(
        fix_plan=sample_fix_plan,
        source_context=source_context,
        repo_path=test_repo_path,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
