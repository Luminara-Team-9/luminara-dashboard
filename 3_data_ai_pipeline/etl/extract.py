"""
extract.py
Reads raw Lighthouse JSON and extracts
performance metrics and opportunity texts.

Flow:
    raw Lighthouse JSON (dict)
            ↓
    extract_metrics(raw_json)
            ↓
    returns clean dict of metrics + opportunities
"""

import json


def extract_metrics(raw_json):
    """
    Extract all performance metrics from raw Lighthouse JSON.
    Input:  raw_json = Lighthouse JSON as Python dict
    Output: dict of metrics + sorted opportunities list
    """

    # audits = detailed results of every individual check
    audits = raw_json.get('audits', {})

    # categories = overall grouped scores
    categories = raw_json.get('categories', {})

    # ─────────────────────────────────────────────────────
    # OPPORTUNITIES EXTRACTION
    # loops through ALL audits Lighthouse ran
    # collects ones marked as 'opportunity' type
    # only keeps ones with savings_ms > 0
    # ─────────────────────────────────────────────────────

    opportunities = []

    for audit_id, audit in audits.items():
        if not isinstance(audit, dict):
            continue

        details = audit.get('details', {})
        if not isinstance(details, dict):
            continue

        if details.get('type') == 'opportunity':
            savings = details.get('overallSavingsMs', 0) or 0
            if savings > 0:
                opportunities.append({
                    'opportunity_id': audit_id,
                    'title': audit.get('title', ''),
                    'description': audit.get('description', ''),
                    'savings_ms': float(savings),
                })

    # sort highest savings first
    # RA picks highest impact fix first
    opportunities_sorted = sorted(
        opportunities,
        key=lambda x: x['savings_ms'],
        reverse=True
    )

    # ─────────────────────────────────────────────────────
    # RESOURCE METRICS FROM NETWORK REQUESTS
    # ─────────────────────────────────────────────────────

    network_items = (
        audits
        .get('network-requests', {})
        .get('details', {})
        .get('items', [])
    )

    # total JS size in KB
    # handles both 'Script' and 'script' casing
    js_size_bytes = sum(
        item.get('transferSize', 0)
        for item in network_items
        if isinstance(item, dict)
        and item.get('resourceType', '').lower() == 'script'
    )
    js_size_kb = round(
        js_size_bytes / 1024, 2
    ) if js_size_bytes > 0 else None

    # total number of network requests
    total_requests = len(network_items) if network_items else None

    # ─────────────────────────────────────────────────────
    # INP — handles both old and new Lighthouse key names
    # new: 'interaction-to-next-paint'
    # old: 'experimental-interaction-to-next-paint'
    # ─────────────────────────────────────────────────────

    inp_audit = audits.get(
        'interaction-to-next-paint',
        audits.get(
            'experimental-interaction-to-next-paint', {}
        )
    )
    inp_ms = inp_audit.get('numericValue', None)

    # ─────────────────────────────────────────────────────
    # RETURN ALL EXTRACTED DATA
    # ─────────────────────────────────────────────────────

    return {

        # page metadata
        'url': raw_json.get(
            'finalDisplayedUrl',
            raw_json.get('finalUrl', None)
        ),
        'fetch_time': raw_json.get('fetchTime', None),
        # transform.py converts to datetime

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

        # performance metrics (raw milliseconds)
        # transform.py rounds these
        'lcp_ms': audits.get(
            'largest-contentful-paint', {}
        ).get('numericValue', None),
        # good: < 2500ms

        'tbt_ms': audits.get(
            'total-blocking-time', {}
        ).get('numericValue', None),
        # good: < 200ms

        'cls_score': audits.get(
            'cumulative-layout-shift', {}
        ).get('numericValue', None),
        # good: < 0.1
        # uses numericValue (actual number, not 0-1 score)

        'fcp_ms': audits.get(
            'first-contentful-paint', {}
        ).get('numericValue', None),
        # good: < 1800ms

        'si_ms': audits.get(
            'speed-index', {}
        ).get('numericValue', None),
        # good: < 3400ms

        'tti_ms': audits.get(
            'interactive', {}
        ).get('numericValue', None),
        # good: < 3800ms

        'ttfb_ms': audits.get(
            'server-response-time', {}
        ).get('numericValue', None),
        # good: < 800ms

        'inp_ms': inp_ms,
        # good: < 200ms
        # handled separately (two possible key names)

        # resource metrics
        'total_page_size_bytes': audits.get(
            'total-byte-weight', {}
        ).get('numericValue', None),
        # in BYTES — transform.py converts to KB

        'js_size_kb': js_size_kb,
        # already converted to KB above

        'total_requests': total_requests,

        # opportunities list
        # sorted highest savings_ms first
        'opportunities': opportunities_sorted,
    }


def extract_from_file(filepath):
    """
    Read Lighthouse JSON from disk and extract metrics.
    Used for local testing before real DB is ready.
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_json = json.load(f)
    return extract_metrics(raw_json)


