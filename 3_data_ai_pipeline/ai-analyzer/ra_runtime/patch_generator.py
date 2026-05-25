"""
patch_generator.py

Production-ready source-aware patch generator for the Luminara Remediation Agent.
"""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from openai import OpenAI

try:
    from .source_context import collect_source_context
except ImportError:
    from source_context import collect_source_context


load_dotenv()

QWEN_MODEL = os.getenv(
    "QWEN_MODEL",
    "/abr/coss41/shared_workspace/yuyu_workspace/data/models/qwen32b-int4",
)

QWEN_BASE_URL = os.getenv(
    "QWEN_BASE_URL",
    "http://localhost:8000/v1",
)

QWEN_API_KEY = os.getenv("QWEN_API_KEY", "dummy")

client = OpenAI(
    base_url=QWEN_BASE_URL,
    api_key=QWEN_API_KEY,
    http_client=httpx.Client(
        trust_env=False,
        timeout=60.0,
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

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise PatchGenerationError(f"No JSON object found in response:\n{text}")

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise PatchGenerationError(f"Failed to parse JSON: {e}\n{text}") from e


def compact_snippet(snippet: str, limit: int = 1200) -> str:
    if len(snippet) <= limit:
        return snippet
    return snippet[:limit] + "\n\n/* ... snippet truncated ... */"


def build_source_context_text(source_context: Dict[str, Any]) -> str:
    parts = []

    for i, item in enumerate(source_context.get("candidate_files", [])[:5], 1):
        parts.append(
            f"""
[SOURCE_FILE_{i}]
path: {item["path"]}
score: {item["score"]}
fix_type: {item.get("fix_type", source_context.get("fix_type", "unknown"))}

```tsx
{compact_snippet(item["snippet"])}
```
"""
        )

    return "\n".join(parts)


def build_patch_prompt(
    fix_plan: Dict[str, Any],
    source_context: Dict[str, Any],
) -> str:
    source_context_text = build_source_context_text(source_context)
    detected_fix_type = source_context.get("fix_type") or classify_fix_type(fix_plan)

    return f"""
You are the source-aware patch generator for Luminara Remediation Agent.

You are given:
1. A performance Fix Plan from Lighthouse/RAG.
2. Actual source code snippets collected from the PR branch.

Your job:
Generate ONE safe code patch that can be applied to the provided source code.

Detected fix type:
{detected_fix_type}

Fix Plan:
{json.dumps(fix_plan, indent=2, ensure_ascii=False, default=str)}

Available source context:
{source_context_text}

Return ONLY valid JSON with this exact structure:

{{
  "auto_applicable": true,
  "patches": [
    {{
      "target_file": "path copied exactly from one SOURCE_FILE path",
      "original_code": "exact code copied from the provided source snippet",
      "suggested_code": "complete replacement code",
      "change_type": "code_replace",
      "change_reason": "short reason why this improves the selected Lighthouse opportunity"
    }}
  ],
  "manual_review_reason": null
}}

Strict rules:
- You MUST NOT invent file paths.
- target_file MUST be copied exactly from one of the SOURCE_FILE paths.
- original_code MUST be copied exactly from the provided source snippets.
- suggested_code MUST be real code that replaces original_code.
- Do NOT use placeholder code.
- Do NOT return markdown.
- Do NOT modify unrelated logic.
- Prefer the smallest safe patch.
- If no safe exact patch can be generated from the provided snippets, return auto_applicable=false.
- original_code must be a real code block, not only a URL or string literal.
- Do not make a patch just because source code exists. The patch must directly address the selected Lighthouse opportunity.
- Do NOT comment out imports unless the imported component is also removed from JSX.
- Do NOT return suggestion comments such as "Consider...", "Maybe...", or "Should..." inside suggested_code.
- If lazy loading is needed, write actual working code using dynamic import.
- suggested_code must compile as-is.
- If suggested_code uses dynamic(), it MUST also include import dynamic from 'next/dynamic' in the replacement block or original_code must already contain it.
- Do NOT use dynamic import for named exports unless you correctly map the named export with .then(mod => mod.ComponentName).
- original_code must contain ALL dependent lines required for the patch to compile.
- If modifying imports, original_code must also include related component declarations or JSX usage.
- Do NOT generate partial import-only refactors.

Opportunity matching rules:
- First understand the selected Lighthouse opportunity from the Fix Plan.
- Generate a patch ONLY if the source code contains code directly related to that selected opportunity.
- Do not reuse an image-loading patch for JavaScript/TBT, CSS/render-blocking, server/TTFB, cache, or CDN opportunities.
- For unused JavaScript/TBT issues, only patch code related to JS execution, dynamic imports, script loading, heavy component loading, or unused imports.
- For CSS/render-blocking issues, only patch CSS, stylesheet, font, or critical rendering path code.
- For layout/CLS issues, only patch layout stability code such as width, height, aspect-ratio, reserved space, or skeleton placeholder.
- For server/TTFB/cache/CDN issues, return auto_applicable=false unless the provided source context contains an explicit server/config file that can be safely changed.
- If the source context only contains unrelated files, return auto_applicable=false.

Patch guidance by fix type:
- Image/LCP:
  - For product detail image galleries using map((img, i) => ...), first visible image should use loading={{i === 0 ? 'eager' : 'lazy'}}.
  - First visible image should use fetchPriority={{i === 0 ? 'high' : 'auto'}}.
  - All images may use decoding="async".
  - Do NOT set loading="lazy" for every image if the first image may be LCP.
  - For a single hero/LCP image outside a loop, use loading="eager", fetchPriority="high", decoding="async".
  - Add width/height only when safe and when dimensions are already known.
- JavaScript/TBT:
  - Prefer safe lazy loading, dynamic import, script defer/async, or removing clearly unused imports.
  - Do not change business logic.
- CSS/FCP/render-blocking:
  - Prefer safe stylesheet/font-display/critical-rendering-path changes.
  - Do not rewrite unrelated classes.
- Server/TTFB:
  - Return auto_applicable=false unless the snippet includes safe config/header/cache code.
- Unknown:
  - Return auto_applicable=false.

If no safe exact patch can be generated, return:

{{
  "auto_applicable": false,
  "patches": [],
  "manual_review_reason": "explain why no safe patch can be generated from the provided source context"
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
        "requestidlecallback", "settimeout", "swetrix", "trackviews", "init("
    ]):
        return "javascript"

    if any(k in text for k in [
        ".css", "stylesheet", "@import", "font-display", "media=\"print\"",
        "rel=\"preload\"", "rel='preload'", "classname", "style=",
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
        return patch_type == "javascript"

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

    # Dynamic refactor touching imports only
    has_imports = "import " in original
    has_jsx = "<" in original and "/>" in original

    # Unsafe if imports modified without JSX scope
    if has_imports and not has_jsx:
        return True

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
            continue

        if unsafe_import_removal_without_usage_removal(patch):
            continue

        if unsafe_dynamic_without_import(patch):
            continue

        if unsafe_partial_dynamic_refactor(patch):
            continue

        if not is_safe_repo_relative_path(target_file, source_context):
            continue

        if not patch_matches_fix_type(fix_type, patch):
            continue

        if not target_file or target_file not in source_by_path:
            continue

        if not original_code or not suggested_code:
            continue

        if not looks_like_real_code_block(original_code, fix_type):
            continue

        if original_code.strip() == suggested_code.strip():
            continue

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
        "patches": valid_patches[:1],
        "manual_review_reason": None,
    }


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

        if not target_file or not original_code or not suggested_code:
            continue

        if not looks_like_real_code_block(original_code, fix_type):
            continue

        file_path = (repo_root / target_file).resolve()

        if not file_path.exists():
            continue

        if not str(file_path).startswith(str(repo_root)):
            continue

        content = file_path.read_text(encoding="utf-8", errors="ignore")

        if original_code not in content:
            continue

        valid_patches.append(patch)

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
        "patches": valid_patches[:1],
        "manual_review_reason": None,
    }


def generate_patch_from_source(
    fix_plan: Dict[str, Any],
    source_context: Dict[str, Any],
    repo_path: str,
) -> Dict[str, Any]:
    if not source_context.get("candidate_files"):
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": "No source context candidates were found.",
        }

    prompt = build_patch_prompt(
        fix_plan=fix_plan,
        source_context=source_context,
    )

    try:
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate safe code patches only from provided source snippets. "
                        "Return one compact JSON object only. No markdown."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.1,
            max_tokens=2048,
        )

        raw = response.choices[0].message.content
        patch_result = extract_json(raw)

    except Exception as e:
        return {
            "auto_applicable": False,
            "patches": [],
            "manual_review_reason": f"Qwen patch generation failed: {e}",
        }

    patch_result = validate_patch_against_context(
        patch_result=patch_result,
        source_context=source_context,
        fix_plan=fix_plan,
    )

    patch_result = validate_patch_against_files(
        patch_result=patch_result,
        repo_path=repo_path,
        source_context=source_context,
        fix_plan=fix_plan,
    )

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
