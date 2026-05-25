"""
extract.py

Production-ready Lighthouse JSON extractor for Luminara.

Purpose:
- Extract Core Web Vitals and Lighthouse metrics.
- Extract Lighthouse opportunities with stable category/severity hints.
- Preserve enough details for ETL, AI Fix Plan generation, dashboard, and RAG.

Flow:
    raw_json -> extract_metrics() -> clean dict -> transform.py/load.py

This file does NOT write to DB.
"""

import json
from typing import Any, Dict, List, Optional


def safe_float(value: Any) -> Optional[float]:
    """Convert value to float safely."""
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def safe_score(value: Any) -> Optional[float]:
    """
    Lighthouse category score is usually 0-1.
    Keep raw 0-1 here. transform.py can convert to 0-100.
    """
    score = safe_float(value)

    if score is None:
        return None

    return score


def get_audit(audits: Dict[str, Any], audit_id: str) -> Dict[str, Any]:
    audit = audits.get(audit_id, {})
    return audit if isinstance(audit, dict) else {}


def get_numeric_value(audits: Dict[str, Any], audit_id: str) -> Optional[float]:
    return safe_float(get_audit(audits, audit_id).get("numericValue"))


def get_score_display_mode(audits: Dict[str, Any], audit_id: str) -> Optional[str]:
    mode = get_audit(audits, audit_id).get("scoreDisplayMode")
    return str(mode) if mode is not None else None


def classify_opportunity_category(audit_id: str, title: str, description: str) -> str:
    """
    Lightweight generic classification for downstream priority/risk logic.
    This does not generate a fix. It only labels the opportunity type.
    """
    text = f"{audit_id} {title} {description}".lower()

    if any(k in text for k in [
        "image",
        "lcp image",
        "next-gen",
        "webp",
        "avif",
        "offscreen",
        "properly size",
    ]):
        return "image"

    if any(k in text for k in [
        "javascript",
        "unused-javascript",
        "legacy-javascript",
        "main-thread",
        "third-party",
        "bootup",
        "script",
    ]):
        return "javascript"

    if any(k in text for k in [
        "css",
        "stylesheet",
        "render-blocking",
        "font",
    ]):
        return "css"

    if any(k in text for k in [
        "server-response",
        "initial server response",
        "ttfb",
        "time to first byte",
    ]):
        return "server"

    if any(k in text for k in [
        "layout shift",
        "cls",
        "cumulative-layout-shift",
        "aspect-ratio",
    ]):
        return "layout"

    return "performance"


def infer_affected_metric(audit_id: str, title: str, description: str, category: str) -> str:
    text = f"{audit_id} {title} {description}".lower()

    if "lcp" in text or "largest contentful paint" in text:
        return "LCP"

    if "tbt" in text or "total blocking time" in text or category == "javascript":
        return "TBT"

    if "cls" in text or "layout shift" in text or category == "layout":
        return "CLS"

    if "fcp" in text or "first contentful paint" in text or category == "css":
        return "FCP"

    if "server-response" in text or "ttfb" in text or category == "server":
        return "TTFB"

    return "performance_score"


def estimate_severity(savings_ms: float, affected_metric: str) -> str:
    """
    Generic severity from estimated savings.
    transform.py/agent.py can still override later.
    """
    if affected_metric == "CLS":
        return "medium"

    if savings_ms >= 1000:
        return "high"

    if savings_ms >= 300:
        return "medium"

    return "low"


def estimate_ms_from_bytes(savings_bytes: float) -> float:
    """
    Conservative byte-savings to ms estimate.

    Current old logic used 1KB ~= 1ms.
    Keep it simple, but name it clearly as an estimate.
    """
    return round(savings_bytes / 1024, 2)


def get_network_items(audits: Dict[str, Any]) -> List[Dict[str, Any]]:
    network_audit = get_audit(audits, "network-requests")
    details = network_audit.get("details", {})

    if not isinstance(details, dict):
        return []

    items = details.get("items", [])

    if not isinstance(items, list):
        return []

    return [item for item in items if isinstance(item, dict)]


def sum_resource_kb(network_items: List[Dict[str, Any]], resource_types: List[str]) -> Optional[float]:
    """
    Sum transferSize for one or more resource types.
    Lighthouse resourceType values can vary across versions.
    """
    wanted = {item.lower() for item in resource_types}

    total = 0

    for item in network_items:
        resource_type = str(item.get("resourceType", "")).lower()

        if resource_type in wanted:
            total += safe_float(item.get("transferSize")) or 0

    return round(total / 1024, 2) if total > 0 else None


def extract_opportunities(audits: Dict[str, Any]) -> List[Dict[str, Any]]:
    opportunities = []

    for audit_id, audit in audits.items():
        if not isinstance(audit, dict):
            continue

        details = audit.get("details", {})

        if not isinstance(details, dict):
            continue

        if details.get("type") != "opportunity":
            continue

        title = audit.get("title", "") or ""
        description = audit.get("description", "") or ""

        savings_ms = safe_float(details.get("overallSavingsMs")) or 0.0
        savings_bytes = safe_float(details.get("overallSavingsBytes")) or 0.0

        savings_source = "ms"

        if savings_ms <= 0 and savings_bytes > 0:
            savings_ms = estimate_ms_from_bytes(savings_bytes)
            savings_source = "bytes_estimate"

        if savings_ms <= 0:
            continue

        category = classify_opportunity_category(
            audit_id=audit_id,
            title=title,
            description=description,
        )

        affected_metric = infer_affected_metric(
            audit_id=audit_id,
            title=title,
            description=description,
            category=category,
        )

        severity = estimate_severity(
            savings_ms=savings_ms,
            affected_metric=affected_metric,
        )

        detail_items = details.get("items", [])
        if not isinstance(detail_items, list):
            detail_items = []

        details_json = {
            "type": "opportunity",
            "scoreDisplayMode": audit.get("scoreDisplayMode"),
            "overallSavingsMs": details.get("overallSavingsMs"),
            "overallSavingsBytes": details.get("overallSavingsBytes"),
            "savings_source": savings_source,
            "items": detail_items[:5],
        }

        opportunities.append({
            "opportunity_id": audit_id,
            "title": title,
            "description": description,
            "savings_ms": float(savings_ms),
            "savings_bytes": float(savings_bytes) if savings_bytes else None,
            "savings_source": savings_source,
            "category": category,
            "affected_metric": affected_metric,
            "severity": severity,
            "score_display_mode": audit.get("scoreDisplayMode"),
            "details": details_json,
        })

    return sorted(
        opportunities,
        key=lambda item: item["savings_ms"],
        reverse=True,
    )


def extract_metrics(raw_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract all useful metrics from raw Lighthouse JSON.

    Input:
        raw_json dict from Lighthouse

    Output:
        clean dict ready for transform.py/load.py
    """
    audits = raw_json.get("audits", {})
    categories = raw_json.get("categories", {})

    if not isinstance(audits, dict):
        audits = {}

    if not isinstance(categories, dict):
        categories = {}

    network_items = get_network_items(audits)

    js_size_kb = sum_resource_kb(network_items, ["script"])
    css_size_kb = sum_resource_kb(network_items, ["stylesheet", "css"])
    image_size_kb = sum_resource_kb(network_items, ["image", "media"])
    total_requests = len(network_items) if network_items else None

    inp_audit = get_audit(audits, "interaction-to-next-paint")
    if not inp_audit:
        inp_audit = get_audit(audits, "experimental-interaction-to-next-paint")

    inp_ms = safe_float(inp_audit.get("numericValue"))

    opportunities_sorted = extract_opportunities(audits)

    diagnostics = {
        "has_audits": bool(audits),
        "has_categories": bool(categories),
        "network_request_count": total_requests,
        "opportunity_count": len(opportunities_sorted),
        "missing_core_metrics": [
            metric
            for metric, value in {
                "lcp_ms": get_numeric_value(audits, "largest-contentful-paint"),
                "tbt_ms": get_numeric_value(audits, "total-blocking-time"),
                "cls_score": get_numeric_value(audits, "cumulative-layout-shift"),
                "fcp_ms": get_numeric_value(audits, "first-contentful-paint"),
            }.items()
            if value is None
        ],
    }

    return {
        # metadata
        "url": raw_json.get(
            "finalDisplayedUrl",
            raw_json.get("finalUrl", None),
        ),
        "fetch_time": raw_json.get("fetchTime", None),
        "lighthouse_version": raw_json.get("lighthouseVersion", None),
        "user_agent": raw_json.get("userAgent", None),

        # category scores: raw 0-1 scale
        "performance_score": safe_score(
            categories.get("performance", {}).get("score")
            if isinstance(categories.get("performance", {}), dict)
            else None
        ),
        "accessibility_score": safe_score(
            categories.get("accessibility", {}).get("score")
            if isinstance(categories.get("accessibility", {}), dict)
            else None
        ),
        "best_practices_score": safe_score(
            categories.get("best-practices", {}).get("score")
            if isinstance(categories.get("best-practices", {}), dict)
            else None
        ),
        "seo_score": safe_score(
            categories.get("seo", {}).get("score")
            if isinstance(categories.get("seo", {}), dict)
            else None
        ),

        # performance metrics
        "lcp_ms": get_numeric_value(audits, "largest-contentful-paint"),
        "tbt_ms": get_numeric_value(audits, "total-blocking-time"),
        "cls_score": get_numeric_value(audits, "cumulative-layout-shift"),
        "fcp_ms": get_numeric_value(audits, "first-contentful-paint"),
        "si_ms": get_numeric_value(audits, "speed-index"),
        "tti_ms": get_numeric_value(audits, "interactive"),
        "ttfb_ms": get_numeric_value(audits, "server-response-time"),
        "inp_ms": inp_ms,

        # score display modes, useful for debugging Lighthouse differences
        "lcp_display_mode": get_score_display_mode(audits, "largest-contentful-paint"),
        "tbt_display_mode": get_score_display_mode(audits, "total-blocking-time"),
        "cls_display_mode": get_score_display_mode(audits, "cumulative-layout-shift"),
        "fcp_display_mode": get_score_display_mode(audits, "first-contentful-paint"),
        "ttfb_display_mode": get_score_display_mode(audits, "server-response-time"),

        # resource metrics
        "total_page_size_bytes": get_numeric_value(audits, "total-byte-weight"),
        "js_size_kb": js_size_kb,
        "css_size_kb": css_size_kb,
        "image_size_kb": image_size_kb,
        "total_requests": total_requests,

        # structured opportunities
        "opportunities": opportunities_sorted,

        # extraction diagnostics
        "diagnostics": diagnostics,
    }


def extract_from_file(filepath: str) -> Dict[str, Any]:
    """Load Lighthouse JSON from disk and extract metrics."""
    with open(filepath, "r", encoding="utf-8") as file:
        raw_json = json.load(file)

    return extract_metrics(raw_json)