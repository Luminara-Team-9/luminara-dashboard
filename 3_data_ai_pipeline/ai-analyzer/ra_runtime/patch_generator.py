"""
patch_generator.py

Production-ready source-aware patch generator for the Luminara Remediation Agent.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

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
    rag_context: str = "",
) -> str:
    source_context_text = build_source_context_text(source_context)
    detected_fix_type = source_context.get("fix_type") or classify_fix_type(fix_plan)

    rag_section = ""
    if rag_context and rag_context.strip():
        rag_section = f"""
Knowledge base (RAG fix guides relevant to this problem):
{rag_context.strip()}

Use the above knowledge to understand WHAT kind of fix is appropriate.
Then look at the source code below to decide WHERE and HOW to apply it.
"""

    return f"""
You are the source-aware patch generator for Luminara Remediation Agent.

You are given a Lighthouse performance problem, relevant fix guides from a knowledge base,
and the actual source code from the repository.
Your job: use the fix guides + source code together to generate the ONE safest possible patch.

Fix type: {detected_fix_type}

Fix Plan:
{json.dumps(fix_plan, indent=2, ensure_ascii=False, default=str)}
{rag_section}
Source code:
{source_context_text}

--- HARD RULES (these are enforced by a validator — violations will be rejected) ---

File and code rules:
- target_file MUST be copied exactly from one of the SOURCE_FILE paths above. Do not invent paths.
- original_code MUST be an exact copy of code from the provided source snippets.
- suggested_code MUST compile as valid TypeScript/JavaScript as-is. No placeholders.
- Do NOT return markdown. Return only the JSON object.
- Prefer the smallest patch that directly addresses the Lighthouse opportunity.
- Do not make a patch just because source code exists — it must fix the actual problem.

Import safety rules:
- Do NOT remove an import line unless you also remove every JSX usage of that import.
- If you convert import X to dynamic(), the const X must be declared in suggested_code.
- For named imports {{ X }}: use dynamic(() => import('...').then(mod => mod.X), {{ ssr: false }})
- For default imports X: use dynamic(() => import('...'), {{ ssr: false }})
- If suggested_code uses dynamic(), include import dynamic from 'next/dynamic' in suggested_code.
- Do NOT touch import lines that are unrelated to your patch.

When to return auto_applicable=false:
- No code in the source context directly relates to the Lighthouse opportunity.
- The only fix requires runtime data (e.g. which specific CSS rules are unused).
- The fix requires infrastructure changes (server config, CDN, Redis).
- You cannot find a safe, exact original_code block to replace.

--- CONSTRAINTS BY FIX TYPE ---

image (LCP, offscreen images):
  Add loading, fetchPriority, decoding attributes to <img> tags.
  Do not guess dimensions — only add width/height if already in the source.

javascript (unused-javascript, TBT):
  Do NOT try to remove imports or bundle code — you have no runtime data.
  Safe options you may use if present in the source:
  - Change <Script strategy="afterInteractive"> to strategy="lazyOnload" for non-critical scripts.
  - Convert a non-critical analytics/chat import to dynamic() so it loads after page is interactive.
  - Add display:'swap' to a next/font config that is missing it.
  If none of these apply to the actual source code shown → return auto_applicable=false.

css (unused-css-rules, render-blocking):
  Do NOT remove CSS rules. Safe options: add display=swap to Google Fonts URL,
  add display:'swap' to next/font config, add font-display:swap to @font-face.
  If none apply → return auto_applicable=false.

server (server-response-time, TTFB):
  Only patch next.config.js headers() for Cache-Control on static paths.
  If next.config.js is not in the source context → return auto_applicable=false.

layout (CLS):
  Only patch width, height, aspect-ratio, min-height values.

--- OUTPUT FORMAT ---

Return ONLY this JSON (no markdown, no extra text):

{{
  "auto_applicable": true,
  "patches": [
    {{
      "target_file": "exact path from SOURCE_FILE",
      "original_code": "exact code from source",
      "suggested_code": "replacement code that compiles",
      "change_type": "code_replace",
      "change_reason": "one sentence: what this fixes and why it helps"
    }}
  ],
  "manual_review_reason": null
}}

If no safe patch exists:

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
            logger.info("[validate_files] REJECT target=%s: file not found in repo at %s", target_file, file_path)
            continue

        if not str(file_path).startswith(str(repo_root)):
            logger.info("[validate_files] REJECT target=%s: path escapes repo root", target_file)
            continue

        content = file_path.read_text(encoding="utf-8", errors="ignore")

        if original_code not in content:
            logger.info(
                "[validate_files] REJECT target=%s: original_code not found in file (first 200 chars of original_code: %r)",
                target_file,
                (original_code or "")[:200],
            )
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

    prompt = build_patch_prompt(
        fix_plan=fix_plan,
        source_context=source_context,
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

        patch_result = extract_json(raw)

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

    patch_result = validate_patch_against_context(
        patch_result=patch_result,
        source_context=source_context,
        fix_plan=fix_plan,
    )

    logger.info("[patch_generator] after validate_context: auto_applicable=%s reason=%s",
                patch_result.get("auto_applicable"), patch_result.get("manual_review_reason"))

    patch_result = validate_patch_against_files(
        patch_result=patch_result,
        repo_path=repo_path,
        source_context=source_context,
        fix_plan=fix_plan,
    )

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
