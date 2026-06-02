"""
audit_ingestion.py

Parses raw Lighthouse CI (LHCI) JSON results (LHR dicts) into structured
metrics and opportunities for the agent. No DB writes.
"""

from typing import Any, Dict, List, Optional


# Lighthouse audit IDs that are actionable performance opportunities.
OPPORTUNITY_AUDIT_IDS = {
    "unused-javascript",
    "unused-css-rules",
    "render-blocking-resources",
    "uses-optimized-images",
    "uses-webp-images",
    "uses-text-compression",
    "offscreen-images",
    "server-response-time",
    "prioritize-lcp-image",
    "uses-responsive-images",
    "efficient-animated-content",
    "duplicated-javascript",
    "legacy-javascript",
    "third-party-summary",
    "third-party-facades",
    "bootup-time",
    "mainthread-work-breakdown",
    "total-byte-weight",
    "dom-size",
}

_METRIC_TO_AFFECTED: Dict[str, str] = {
    "prioritize-lcp-image":        "LCP",
    "uses-optimized-images":       "LCP",
    "offscreen-images":            "LCP",
    "uses-responsive-images":      "LCP",
    "uses-webp-images":            "LCP",
    "efficient-animated-content":  "LCP",
    "total-byte-weight":           "LCP",
    "unused-javascript":           "TBT",
    "legacy-javascript":           "TBT",
    "bootup-time":                 "TBT",
    "mainthread-work-breakdown":   "TBT",
    "third-party-summary":         "TBT",
    "third-party-facades":         "TBT",
    "duplicated-javascript":       "TBT",
    "render-blocking-resources":   "FCP",
    "unused-css-rules":            "FCP",
    "uses-text-compression":       "FCP",
    "server-response-time":        "TTFB",
    "dom-size":                    "TBT",
}


# ─────────────────────────────────────────────
# Parsing helpers
# ─────────────────────────────────────────────

def _num(audits: dict, key: str) -> Optional[float]:
    val = audits.get(key, {}).get("numericValue")
    return float(val) if val is not None else None


def _score(categories: dict, key: str) -> Optional[float]:
    s = categories.get(key, {}).get("score")
    return round(float(s) * 100, 1) if s is not None else None


def _severity(savings_ms: Optional[float]) -> str:
    if not savings_ms:
        return "low"
    if savings_ms >= 3000:
        return "high"
    if savings_ms >= 1000:
        return "medium"
    return "low"


def parse_metrics(lhr: dict) -> dict:
    audits     = lhr.get("audits", {})
    categories = lhr.get("categories", {})
    return {
        "lcp_ms":              _num(audits, "largest-contentful-paint"),
        "tbt_ms":              _num(audits, "total-blocking-time"),
        "cls_score":           _num(audits, "cumulative-layout-shift"),
        "fcp_ms":              _num(audits, "first-contentful-paint"),
        "si_ms":               _num(audits, "speed-index"),
        "tti_ms":              _num(audits, "interactive"),
        "ttfb_ms":             _num(audits, "server-response-time"),
        "inp_ms":              _num(audits, "interaction-to-next-paint"),
        "performance_score":   _score(categories, "performance"),
        "accessibility_score": _score(categories, "accessibility"),
        "best_practices_score":_score(categories, "best-practices"),
        "seo_score":           _score(categories, "seo"),
    }


def parse_opportunities(lhr: dict, test_id: int) -> List[dict]:
    audits = lhr.get("audits", {})
    result = []
    for audit_id, audit in audits.items():
        if audit_id not in OPPORTUNITY_AUDIT_IDS:
            continue
        score = audit.get("score")
        if score is not None and float(score) >= 0.9:
            continue  # already passing
        details    = audit.get("details") or {}
        savings_ms = details.get("overallSavingsMs") or audit.get("numericValue")
        result.append({
            "test_id":          test_id,
            "opportunity_id":   audit_id,
            "title":            audit.get("title", ""),
            "description":      audit.get("description", ""),
            "savings_ms":       float(savings_ms) if savings_ms else None,
            "savings_bytes":    float(details["overallSavingsBytes"])
                                if details.get("overallSavingsBytes") else None,
            "severity":         _severity(savings_ms),
            "category":         "performance",
            "details":          details or None,
            "affected_metric":  _METRIC_TO_AFFECTED.get(audit_id, "performance_score"),
            "savings_source":   "lhci",
            "score_display_mode": audit.get("scoreDisplayMode"),
        })
    return result
