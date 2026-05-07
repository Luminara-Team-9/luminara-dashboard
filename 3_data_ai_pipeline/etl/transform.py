"""
transform.py
Cleans and validates extracted Lighthouse metrics.
Prepares data for loading into PostgreSQL.

Flow:
    extract.py output (raw dict)
            ↓
    transform(extracted)
            ↓
    clean validated dict ready for load.py
"""

from datetime import datetime, timezone


def transform(extracted):
    """
    Clean and validate extracted Lighthouse metrics.
    Input:  extracted = raw dict from extract.py
    Output: clean validated dict ready for PostgreSQL
    """

    # ─────────────────────────────────────────────────
    # HELPER FUNCTIONS
    # ─────────────────────────────────────────────────

    def safe_float(value):
        # safely convert to float, None if fails
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def safe_int(value):
        # safely convert to int, None if fails
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

    def safe_round(value, decimals=2):
        # safely round float, None if fails
        # Example: 4039.58755 → 4039.59
        if value is None:
            return None
        try:
            return round(float(value), decimals)
        except (ValueError, TypeError):
            return None

    def score_to_100(value):
        # convert Lighthouse 0-1 score → 0-100
        # Example: 0.33 → 33.0
        if value is None:
            return None
        try:
            return round(float(value) * 100, 1)
        except (ValueError, TypeError):
            return None

    def parse_timestamp(fetch_time):
        # convert "2026-05-05T18:02:51.468Z" → datetime
        if fetch_time is None:
            return None
        try:
            return datetime.strptime(
                fetch_time,
                '%Y-%m-%dT%H:%M:%S.%fZ'
            ).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return None

    def get_severity(savings_ms):
        # assign severity based on savings_ms
        # high > 500ms, medium 200-500ms, low < 200ms
        if savings_ms is None:
            return 'low'
        if savings_ms > 500:
            return 'high'
        elif savings_ms >= 200:
            return 'medium'
        else:
            return 'low'

    # ─────────────────────────────────────────────────
    # TRANSFORM OPPORTUNITIES
    # adds severity to each opportunity
    # ─────────────────────────────────────────────────

    transformed_opportunities = []
    for opp in extracted.get('opportunities', []):
        savings = safe_round(opp.get('savings_ms'))
        transformed_opportunities.append({
            'opportunity_id': opp.get('opportunity_id', ''),
            'title': opp.get('title', ''),
            'description': opp.get('description', ''),
            'savings_ms': savings,
            'severity': get_severity(savings),
        })

    # ─────────────────────────────────────────────────
    # RETURN CLEAN DATA
    # ─────────────────────────────────────────────────

    return {

        # page metadata
        'url': extracted.get('url', None),

        'timestamp': parse_timestamp(
            extracted.get('fetch_time')
        ),
        # renamed fetch_time → timestamp
        # matches lighthouse_runs.timestamp column

        # category scores 0-1 → 0-100
        'performance_score': score_to_100(
            extracted.get('performance_score')
        ),
        'accessibility_score': score_to_100(
            extracted.get('accessibility_score')
        ),
        'best_practices_score': score_to_100(
            extracted.get('best_practices_score')
        ),
        'seo_score': score_to_100(
            extracted.get('seo_score')
        ),

        # performance metrics rounded to 2 decimals
        'lcp_ms': safe_round(extracted.get('lcp_ms')),
        'tbt_ms': safe_round(extracted.get('tbt_ms')),
        'cls_score': safe_round(
            extracted.get('cls_score'), 4
        ),
        # CLS needs 4 decimals (small number e.g. 0.1318)
        'fcp_ms': safe_round(extracted.get('fcp_ms')),
        'si_ms': safe_round(extracted.get('si_ms')),
        'tti_ms': safe_round(extracted.get('tti_ms')),
        'ttfb_ms': safe_round(extracted.get('ttfb_ms')),
        'inp_ms': safe_round(extracted.get('inp_ms')),

        # resource metrics
        'page_size_kb': safe_round(
            safe_float(
                extracted.get('total_page_size_bytes')
            ) / 1024
            if extracted.get('total_page_size_bytes')
            else None
        ),
        # renamed total_page_size_bytes → page_size_kb
        # converted bytes → KB (divide by 1024)
        # matches lighthouse_runs.page_size_kb column

        'js_size_kb': safe_round(
            extracted.get('js_size_kb')
        ),
        'total_requests': safe_int(
            extracted.get('total_requests')
        ),

        # opportunities with severity added
        'opportunities': transformed_opportunities,
    }