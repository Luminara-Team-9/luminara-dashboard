"""
audit_ingestion.py

Parses raw Lighthouse CI (LHCI) JSON results and inserts them into the
production DB tables so the agent can find them via playwright_run_id.

Tables written:
  playwright_runs         — one record per audit batch (3-run group)
  lighthouse_runs         — one record per individual run
  lighthouse_raw_reports  — full raw JSON per run
  lighthouse_opportunities — parsed opportunities per run
"""

import json
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


# ─────────────────────────────────────────────
# DB insertion
# ─────────────────────────────────────────────

def store_audit_runs(
    conn,
    page_type: str,
    device_type: str,
    site_type: str,
    url: str,
    runs: List[dict],
    lhci_run_id: Optional[str] = None,
    pr_branch: Optional[str] = None,
) -> dict:
    """
    Insert a batch of Lighthouse CI runs into the production DB tables.

    Args:
        conn:        open psycopg2 connection (caller commits/closes)
        page_type:   e.g. 'home', 'product', 'category'
        device_type: 'mobile' or 'desktop'
        site_type:   e.g. 'decathlon'
        url:         the page URL that was audited
        runs:        list of raw Lighthouse result dicts (usually 3)
        lhci_run_id: LHCI server build/run ID for traceability
        pr_branch:   PR branch name that triggered the audit

    Returns:
        { "playwright_run_id": int, "test_ids": [int, ...] }
    """
    with conn.cursor() as cur:

        # 1. playwright_runs — one row per audit batch
        cur.execute(
            """
            INSERT INTO playwright_runs
                (run_type, url, device_type, started_at, finished_at,
                 total_tests, success_count, failed_count, status)
            VALUES (%s, %s, %s, NOW(), NOW(), %s, %s, 0, 'completed')
            RETURNING id
            """,
            ("lhci_production", url, device_type, len(runs), len(runs)),
        )
        playwright_run_id: int = cur.fetchone()[0]

        test_ids: List[int] = []

        for run_number, lhr in enumerate(runs, start=1):
            m = parse_metrics(lhr)

            # 2. lighthouse_runs — metrics per run
            cur.execute(
                """
                INSERT INTO lighthouse_runs (
                    playwright_run_id, url, site_type, page_type, device_type,
                    run_number, timestamp,
                    lcp_ms, tbt_ms, cls_score, fcp_ms, si_ms, tti_ms, ttfb_ms, inp_ms,
                    performance_score, accessibility_score, best_practices_score, seo_score
                )
                VALUES (%s,%s,%s,%s,%s, %s,NOW(),
                        %s,%s,%s,%s,%s,%s,%s,%s,
                        %s,%s,%s,%s)
                RETURNING test_id
                """,
                (
                    playwright_run_id, url, site_type, page_type, device_type,
                    run_number,
                    m["lcp_ms"], m["tbt_ms"], m["cls_score"],
                    m["fcp_ms"], m["si_ms"], m["tti_ms"], m["ttfb_ms"], m["inp_ms"],
                    m["performance_score"], m["accessibility_score"],
                    m["best_practices_score"], m["seo_score"],
                ),
            )
            test_id: int = cur.fetchone()[0]
            test_ids.append(test_id)

            # 3. lighthouse_raw_reports — full JSON
            cur.execute(
                """
                INSERT INTO lighthouse_raw_reports (test_id, raw_json, created_at)
                VALUES (%s, %s, NOW())
                """,
                (test_id, json.dumps(lhr)),
            )

            # 4. lighthouse_opportunities — parsed opportunities
            for opp in parse_opportunities(lhr, test_id):
                cur.execute(
                    """
                    INSERT INTO lighthouse_opportunities (
                        test_id, opportunity_id, title, description,
                        savings_ms, savings_bytes, severity, category,
                        details, affected_metric, savings_source, score_display_mode
                    )
                    VALUES (%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,%s)
                    """,
                    (
                        opp["test_id"], opp["opportunity_id"],
                        opp["title"], opp["description"],
                        opp["savings_ms"], opp["savings_bytes"],
                        opp["severity"], opp["category"],
                        json.dumps(opp["details"]) if opp["details"] else None,
                        opp["affected_metric"], opp["savings_source"],
                        opp["score_display_mode"],
                    ),
                )

        conn.commit()

    return {
        "playwright_run_id": playwright_run_id,
        "test_ids": test_ids,
    }
