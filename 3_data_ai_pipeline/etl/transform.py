"""
transform.py

Production-ready transformer for extracted Lighthouse metrics.

Purpose:
- Clean and validate extracted Lighthouse metrics.
- Preserve opportunity metadata needed by:
  - PostgreSQL load.py
  - RAG embed.py
  - AI agent.py
  - dashboard

Flow:
    extract.py output -> transform() -> clean dict ready for load.py
"""

from datetime import datetime, timezone
from typing import Any, Optional


# ─────────────────────────────────────────────
# Safe conversion helpers
# ─────────────────────────────────────────────

def safe_float(value: Any) -> Optional[float]:
    """Convert value to float, None if fails."""
    if value is None:
        return None

    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def safe_int(value: Any) -> Optional[int]:
    """Convert value to int, None if fails."""
    if value is None:
        return None

    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def safe_round(value: Any, decimals: int = 2) -> Optional[float]:
    """Round float safely, None if fails."""
    number = safe_float(value)

    if number is None:
        return None

    return round(number, decimals)


def score_to_100(value: Any) -> Optional[float]:
    """
    Convert Lighthouse score to 0-100.

    Expected input from extract.py:
    - usually 0-1
    - if already 0-100, keep as 0-100
    """
    score = safe_float(value)

    if score is None:
        return None

    if score <= 1:
        return round(score * 100, 1)

    return round(score, 1)


def parse_timestamp(fetch_time: Any) -> Optional[datetime]:
    """
    Convert Lighthouse fetchTime to timezone-aware datetime.

    Supports:
    - 2026-05-05T18:02:51.468Z
    - 2026-05-05T18:02:51Z
    - ISO strings with timezone offsets
    """
    if fetch_time is None:
        return None

    if isinstance(fetch_time, datetime):
        if fetch_time.tzinfo is None:
            return fetch_time.replace(tzinfo=timezone.utc)
        return fetch_time

    text = str(fetch_time).strip()

    if not text:
        return None

    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed

    except ValueError:
        return None


# ─────────────────────────────────────────────
# Opportunity helpers
# ─────────────────────────────────────────────

def fallback_severity(savings_ms: Optional[float], affected_metric: str = "") -> str:
    """
    Fallback severity when extract.py does not provide one.

    This is intentionally simple. Agent/risk logic can override later.
    """
    if savings_ms is None:
        return "low"

    metric = (affected_metric or "").upper()

    if metric == "CLS":
        return "medium"

    if savings_ms >= 1000:
        return "high"

    if savings_ms >= 300:
        return "medium"

    return "low"


def fallback_category(opportunity_id: str, title: str = "", description: str = "") -> str:
    """
    Generic category fallback for old extract.py output.
    """
    text = f"{opportunity_id} {title} {description}".lower()

    if any(k in text for k in [
        "image",
        "img",
        "webp",
        "avif",
        "responsive",
        "offscreen",
        "animated",
        "properly size",
    ]):
        return "image"

    if any(k in text for k in [
        "javascript",
        "unused-javascript",
        "legacy-javascript",
        "script",
        "bootup",
        "mainthread",
        "main-thread",
        "third-party",
        "third-part",
    ]):
        return "javascript"

    if any(k in text for k in [
        "css",
        "stylesheet",
        "style",
        "render-blocking",
        "font",
    ]):
        return "css"

    if any(k in text for k in [
        "server",
        "response-time",
        "server-response",
        "ttfb",
        "time to first byte",
    ]):
        return "server"

    if any(k in text for k in [
        "layout-shift",
        "layout shift",
        "cls",
        "cumulative-layout-shift",
        "aspect-ratio",
    ]):
        return "layout"

    if any(k in text for k in [
        "network",
        "compression",
        "preconnect",
        "redirect",
        "byte",
        "transfer",
        "cache",
        "http",
        "latency",
    ]):
        return "network"

    if any(k in text for k in [
        "dom",
        "html",
        "document",
    ]):
        return "html"

    return "performance"


def fallback_affected_metric(
    opportunity_id: str,
    title: str = "",
    description: str = "",
    category: str = "",
) -> str:
    """
    Infer affected metric when extract.py did not provide it.
    """
    text = f"{opportunity_id} {title} {description}".lower()
    category = (category or "").lower()

    if "lcp" in text or "largest contentful paint" in text or category == "image":
        return "LCP"

    if (
        "tbt" in text
        or "total blocking time" in text
        or category == "javascript"
    ):
        return "TBT"

    if "cls" in text or "layout shift" in text or category == "layout":
        return "CLS"

    if (
        "fcp" in text
        or "first contentful paint" in text
        or category == "css"
    ):
        return "FCP"

    if "ttfb" in text or "server-response" in text or category == "server":
        return "TTFB"

    return "performance_score"


def transform_opportunity(opp: dict) -> dict:
    """
    Transform one opportunity.

    Compatible with:
    - old extract.py output
    - new production extract.py output
    """
    opportunity_id = opp.get("opportunity_id", "") or ""
    title = opp.get("title", "") or ""
    description = opp.get("description", "") or ""

    savings_ms = safe_round(opp.get("savings_ms"))

    category = (
        opp.get("category")
        or fallback_category(opportunity_id, title, description)
    )

    affected_metric = (
        opp.get("affected_metric")
        or fallback_affected_metric(
            opportunity_id=opportunity_id,
            title=title,
            description=description,
            category=category,
        )
    )

    severity = (
        opp.get("severity")
        or fallback_severity(savings_ms, affected_metric)
    )

    return {
        "opportunity_id": opportunity_id,
        "title": title,
        "description": description,
        "savings_ms": savings_ms,

        # Extra fields needed for AI/RAG/dashboard.
        "savings_bytes": safe_round(opp.get("savings_bytes")),
        "savings_source": opp.get("savings_source"),
        "severity": severity,
        "category": category,
        "affected_metric": affected_metric,
        "score_display_mode": opp.get("score_display_mode"),

        # Keep details JSONB-compatible.
        "details": opp.get("details", None),
    }


# ─────────────────────────────────────────────
# Main transform
# ─────────────────────────────────────────────

def transform(extracted: dict) -> dict:
    """
    Clean and validate extracted metrics.

    Input:
        raw dict from extract.py

    Output:
        clean dict ready for load.py
    """
    opportunities = extracted.get("opportunities", [])

    if not isinstance(opportunities, list):
        opportunities = []

    transformed_opportunities = [
        transform_opportunity(opp)
        for opp in opportunities
        if isinstance(opp, dict)
    ]

    transformed_opportunities.sort(
        key=lambda item: item.get("savings_ms") or 0,
        reverse=True,
    )

    total_page_size_bytes = safe_float(
        extracted.get("total_page_size_bytes")
    )

    return {
        # Metadata
        "url": extracted.get("url", None),
        "timestamp": parse_timestamp(
            extracted.get("fetch_time")
        ),
        "lighthouse_version": extracted.get("lighthouse_version"),
        "user_agent": extracted.get("user_agent"),

        # Scores: 0-1 -> 0-100
        "performance_score": score_to_100(
            extracted.get("performance_score")
        ),
        "accessibility_score": score_to_100(
            extracted.get("accessibility_score")
        ),
        "best_practices_score": score_to_100(
            extracted.get("best_practices_score")
        ),
        "seo_score": score_to_100(
            extracted.get("seo_score")
        ),

        # Timing metrics
        "lcp_ms": safe_round(extracted.get("lcp_ms")),
        "tbt_ms": safe_round(extracted.get("tbt_ms")),
        "cls_score": safe_round(
            extracted.get("cls_score"),
            4,
        ),
        "fcp_ms": safe_round(extracted.get("fcp_ms")),
        "si_ms": safe_round(extracted.get("si_ms")),
        "tti_ms": safe_round(extracted.get("tti_ms")),
        "ttfb_ms": safe_round(extracted.get("ttfb_ms")),
        "inp_ms": safe_round(extracted.get("inp_ms")),

        # Score display modes for debugging Lighthouse version differences.
        "lcp_display_mode": extracted.get("lcp_display_mode"),
        "tbt_display_mode": extracted.get("tbt_display_mode"),
        "cls_display_mode": extracted.get("cls_display_mode"),
        "fcp_display_mode": extracted.get("fcp_display_mode"),
        "ttfb_display_mode": extracted.get("ttfb_display_mode"),

        # Resource sizes
        "page_size_kb": safe_round(
            total_page_size_bytes / 1024
            if total_page_size_bytes
            else None
        ),
        "js_size_kb": safe_round(
            extracted.get("js_size_kb")
        ),
        "css_size_kb": safe_round(
            extracted.get("css_size_kb")
        ),
        "image_size_kb": safe_round(
            extracted.get("image_size_kb")
        ),
        "total_requests": safe_int(
            extracted.get("total_requests")
        ),

        # Opportunities
        "opportunities": transformed_opportunities,

        # Extraction diagnostics
        "diagnostics": extracted.get("diagnostics", {}),
    }