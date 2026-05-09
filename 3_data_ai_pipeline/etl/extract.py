"""
extract.py
Extracts performance metrics and opportunities
from raw Lighthouse JSON output.

Verified against: Decathlon Korea Lighthouse JSON
Flow: raw_json → extract_metrics() → dict
"""

import json


def extract_metrics(raw_json):
    """
    Extract all metrics from raw Lighthouse JSON.
    Input:  raw_json dict from Lighthouse
    Output: clean dict ready for transform.py
    """

    audits     = raw_json.get('audits', {})
    categories = raw_json.get('categories', {})

    # ── Network requests ──────────────────────────────
    # key: 'network-requests' (verified in real JSON)
    network_items = (
        audits
        .get('network-requests', {})
        .get('details', {})
        .get('items', [])
    )

    def sum_resource_kb(resource_type):
        """Sum transferSize for given resource type → KB"""
        total = sum(
            item.get('transferSize', 0)
            for item in network_items
            if isinstance(item, dict)
            and item.get(
                'resourceType', ''
            ).lower() == resource_type.lower()
        )
        return round(total / 1024, 2) if total > 0 else None

    js_size_kb     = sum_resource_kb('script')
    css_size_kb    = sum_resource_kb('stylesheet')
    image_size_kb  = sum_resource_kb('image')
    total_requests = (
        len(network_items) if network_items else None
    )

    # ── Opportunities ─────────────────────────────────
    # savings can be in overallSavingsMs OR overallSavingsBytes
    # both must be checked (varies by Lighthouse version)
    opportunities = []

    for audit_id, audit in audits.items():
        if not isinstance(audit, dict):
            continue

        details = audit.get('details', {})
        if not isinstance(details, dict):
            continue

        # only process opportunity type
        if details.get('type') != 'opportunity':
            continue

        # try ms savings first, then bytes → ms estimate
        savings_ms = details.get('overallSavingsMs') or 0
        if savings_ms <= 0:
            savings_bytes = (
                details.get('overallSavingsBytes') or 0
            )
            if savings_bytes > 0:
                # rough estimate: 1KB ≈ 1ms
                savings_ms = round(savings_bytes / 1024, 2)

        if savings_ms <= 0:
            continue

        # keep top 5 detail items for JSONB storage
        detail_items = details.get('items', [])
        details_json = {
            'type':  'opportunity',
            'items': detail_items[:5]
        } if detail_items else None

        opportunities.append({
            'opportunity_id': audit_id,
            'title':          audit.get('title', ''),
            'description':    audit.get('description', ''),
            'savings_ms':     float(savings_ms),
            'details':        details_json,
        })

    # sort highest savings first → AI fixes highest impact first
    opportunities_sorted = sorted(
        opportunities,
        key=lambda x: x['savings_ms'],
        reverse=True
    )

    # ── INP ───────────────────────────────────────────
    # key name changed across Lighthouse versions
    # may return None — column is nullable ✅
    inp_audit = audits.get(
        'interaction-to-next-paint',
        audits.get(
            'experimental-interaction-to-next-paint',
            {}
        )
    )
    inp_ms = inp_audit.get('numericValue', None)

    # ── Return ────────────────────────────────────────
    return {

        # metadata
        # finalDisplayedUrl confirmed in real JSON ✅
        'url': raw_json.get(
            'finalDisplayedUrl',
            raw_json.get('finalUrl', None)
        ),
        'fetch_time': raw_json.get('fetchTime', None),

        # category scores (0-1 scale)
        # transform.py converts to 0-100
        'performance_score': categories.get(
            'performance', {}
        ).get('score', None),
        'accessibility_score': categories.get(
            'accessibility', {}
        ).get('score', None),
        'best_practices_score': categories.get(
            'best-practices', {}
        ).get('score', None),
        'seo_score': categories.get(
            'seo', {}
        ).get('score', None),

        # performance metrics (raw ms)
        # transform.py rounds to 2 decimals
        'lcp_ms':  audits.get(
            'largest-contentful-paint', {}
        ).get('numericValue', None),
        'tbt_ms':  audits.get(
            'total-blocking-time', {}
        ).get('numericValue', None),
        'cls_score': audits.get(
            'cumulative-layout-shift', {}
        ).get('numericValue', None),
        'fcp_ms':  audits.get(
            'first-contentful-paint', {}
        ).get('numericValue', None),
        'si_ms':   audits.get(
            'speed-index', {}
        ).get('numericValue', None),
        'tti_ms':  audits.get(
            'interactive', {}
        ).get('numericValue', None),
        'ttfb_ms': audits.get(
            'server-response-time', {}
        ).get('numericValue', None),
        'inp_ms':  inp_ms,

        # resource metrics
        # total_page_size_bytes → transform converts to KB
        'total_page_size_bytes': audits.get(
            'total-byte-weight', {}
        ).get('numericValue', None),
        'js_size_kb':    js_size_kb,
        'css_size_kb':   css_size_kb,
        'image_size_kb': image_size_kb,
        'total_requests': total_requests,

        'opportunities': opportunities_sorted,
    }


def extract_from_file(filepath):
    """Load Lighthouse JSON from disk → extract metrics."""
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_json = json.load(f)
    return extract_metrics(raw_json)