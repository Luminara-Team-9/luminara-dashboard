"""
patch_generator.py

Source-aware patch generator for the Remediation Agent.

This module is used AFTER:
1. git_workspace.py cloned the PR branch into Agent_Workspace.
2. source_context.py collected relevant source snippets.

Purpose:
- Generate real code patches from actual source code context.
- Prevent hallucinated patches by validating original_code exists in the provided source.
- Return patches in a strict JSON-compatible structure.

Important:
- This module does NOT apply patches to files.
- This module only generates and validates patch proposals.
- apply_patch.py will later apply approved patches.
"""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from openai import OpenAI

from ra_runtime.source_context import collect_source_context


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
)


class PatchGenerationError(RuntimeError):
    """Raised when patch generation fails."""


def extract_json(raw_text: str) -> Dict[str, Any]:
    """
    Extract JSON object from Qwen response.

    Handles:
    - pure JSON
    - ```json fenced block
    - extra text around JSON
    """
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
    """Keep source snippet small enough for prompt."""
    if len(snippet) <= limit:
        return snippet

    return snippet[:limit] + "\n\n/* ... snippet truncated ... */"


def build_source_context_text(source_context: Dict[str, Any]) -> str:
    """Convert source_context.py output into prompt text."""
    parts = []

    for i, item in enumerate(source_context.get("candidate_files", [])[:3], 1):
        parts.append(
            f"""
[SOURCE_FILE_{i}]
path: {item["path"]}
score: {item["score"]}

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
    """Build strict source-aware patch generation prompt."""
    source_context_text = build_source_context_text(source_context)

    return f"""
You are the source-aware patch generator for Luminara Remediation Agent.

You are given:
1. A performance Fix Plan from Lighthouse/RAG.
2. Actual source code snippets collected from the PR branch.

Your job:
Generate ONE safe code patch that can be applied to the provided source code.

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
      "change_reason": "short reason why this improves the metric"
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
- If no safe exact patch can be generated from the provided snippets, return:
- original_code must be a real code block, not only a URL or string literal.
- For image fixes, original_code should include the full <img ... /> JSX element when possible.
- For product image galleries, do not lazy-load the first visible image.

{{
  "auto_applicable": false,
  "patches": [],
  "manual_review_reason": "explain why no safe patch can be generated"
}}

Patch guidance:
- For product detail image galleries using map((img, i) => ...):
  - first visible image should use loading={{i === 0 ? 'eager' : 'lazy'}}
  - first visible image should use fetchPriority={{i === 0 ? 'high' : 'auto'}}
  - all images may use decoding="async"
  - do NOT set loading="lazy" for every image if the first image may be LCP.
- For a single hero/LCP image outside a loop:
  - use loading="eager", fetchPriority="high", decoding="async".
- For below-the-fold product/list images:
  - use loading="lazy", decoding="async".
- Add width/height only when safe and when dimensions are already known.
- For TTFB/server/cache issues, return auto_applicable=false.

"""


def looks_like_real_code_block(original_code: str) -> bool:
    """
    Reject patches that replace only a raw URL/string literal.

    We only allow source-aware patches that replace actual JSX/TS/JS/CSS code blocks.
    For image fixes, original_code should normally include an <img ... /> tag
    or a meaningful JSX block, not only an image URL.
    """
    if not original_code:
        return False

    text = original_code.strip()

    # Reject raw URL-only replacement.
    if text.startswith("http://") or text.startswith("https://"):
        return False

    # Reject very short string-only values.
    if len(text) < 20 and "<" not in text and "=" not in text:
        return False

    # Prefer actual code-like patterns.
    code_markers = [
        "<img",
        "<Image",
        "src=",
        "className=",
        "style=",
        "return (",
        "const ",
        "function ",
        "export ",
    ]

    return any(marker in text for marker in code_markers)

def validate_patch_against_context(
    patch_result: Dict[str, Any],
    source_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate generated patch against the provided snippets.

    Checks:
    1. target_file is one of provided source files.
    2. original_code exists in that file snippet.
    3. suggested_code is not empty.
    """
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

    valid_patches = []

    for patch in patches:
        if not isinstance(patch, dict):
            continue

        target_file = patch.get("target_file")
        original_code = patch.get("original_code")
        suggested_code = patch.get("suggested_code")

        if not target_file or target_file not in source_by_path:
            continue

        if not original_code or not suggested_code:
            continue

        if not looks_like_real_code_block(original_code):
            continue
        
        # Do not require exact match inside snippet.
        # Snippets can be truncated or formatting can differ.
        # Final exact validation is done against the actual cloned file
        # in validate_patch_against_files().

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
                "Generated patch was rejected because target_file was not in source context, original_code was invalid, or suggested_code was unsafe."
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
) -> Dict[str, Any]:
    """
    Final validation against actual cloned files.

    This is stronger than snippet validation.
    It checks original_code exists in the real file.
    """
    if not patch_result.get("auto_applicable"):
        return patch_result

    repo_root = Path(repo_path).resolve()
    valid_patches = []

    for patch in patch_result.get("patches", []):
        target_file = patch.get("target_file")
        original_code = patch.get("original_code")
        suggested_code = patch.get("suggested_code")

        if not target_file or not original_code or not suggested_code:
            continue

        if not looks_like_real_code_block(original_code):
            continue

        file_path = (repo_root / target_file).resolve()

        if not file_path.exists():
            continue

        # Safety: prevent path escape outside repo.
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
                "in the actual cloned source file."
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
    """
    Generate and validate source-aware patch.

    Args:
        fix_plan:
            Fix Plan data from DB.

        source_context:
            Output from collect_source_context().

        repo_path:
            Cloned repo path.

    Returns:
        {
          "auto_applicable": bool,
          "patches": [...],
          "manual_review_reason": str | None
        }
    """
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

        print("\n[DEBUG] Raw Qwen patch response:")
        print(raw[:3000])
        print("\n[DEBUG END]\n")

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
    )

    patch_result = validate_patch_against_files(
        patch_result=patch_result,
        repo_path=repo_path,
    )

    return patch_result


if __name__ == "__main__":
    """
    Manual smoke test.

    Requires:
    - Agent_Workspace/fix_plan_999/repo already created by git_workspace.py.
    - Qwen/vLLM server running if you want actual generation.

    Run:
        python -m ra_runtime.patch_generator
    """
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

    result = generate_patch_from_source(
        fix_plan=sample_fix_plan,
        source_context=source_context,
        repo_path=test_repo_path,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))
