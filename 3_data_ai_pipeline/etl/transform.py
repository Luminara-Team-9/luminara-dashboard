"""
transform.py
Cleans and validates extracted Lighthouse metrics.
Prepares data for loading into PostgreSQL.

Flow: extract.py output → transform() → dict
Verified against: Decathlon Korea + Nike Lighthouse JSON
"""

from datetime import datetime, timezone


def transform(extracted):
    """
    Clean and validate extracted metrics.
    Input:  raw dict from extract.py
    Output: clean dict ready for load.py
    """

    # ── Helper functions ──────────────────────────────

    def safe_float(value):
        """Convert to float, None if fails."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def safe_int(value):
        """Convert to int, None if fails."""
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

    def safe_round(value, decimals=2):
        """Round float safely, None if fails."""
        if value is None:
            return None
        try:
            return round(float(value), decimals)
        except (ValueError, TypeError):
            return None

    def score_to_100(value):
        """Convert Lighthouse 0-1 score → 0-100."""
        if value is None:
            return None
        try:
            return round(float(value) * 100, 1)
        except (ValueError, TypeError):
            return None

    def parse_timestamp(fetch_time):
        """
        Convert Lighthouse fetchTime → datetime.
        Format: "2026-05-05T18:02:51.468Z"
        """
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
        """
        Severity based on savings_ms.
        high > 500ms / medium 200-500ms / low < 200ms
        """
        if savings_ms is None:
            return 'low'
        if savings_ms > 500:
            return 'high'
        elif savings_ms >= 200:
            return 'medium'
        else:
            return 'low'

    def get_category(opportunity_id):
        """
        Auto-detect category from opportunity_id keywords.
        """
        oid = opportunity_id.lower()

        if any(k in oid for k in [
            'javascript', 'js', 'script',
            'render-blocking', 'bootup',
            'mainthread', 'third-part',
        ]):
            return 'js'

        elif any(k in oid for k in [
            'css', 'stylesheet', 'style'
        ]):
            return 'css'

        elif any(k in oid for k in [
            'image', 'img', 'webp',
            'responsive', 'offscreen',
            'animated'
        ]):
            return 'image'

        elif any(k in oid for k in [
            'server', 'response-time', 'ttfb'
        ]):
            return 'server'

        elif any(k in oid for k in [
            'network', 'compression', 'preconnect',
            'redirect', 'byte', 'transfer',
            'font', 'cache', 'http', 'latency'
        ]):
            return 'network'

        elif any(k in oid for k in [
            'dom', 'html', 'document'
        ]):
            return 'html'

        else:
            return 'other'

    # ── Transform opportunities ───────────────────────
    # adds severity + category to each opportunity
    # passes details through for JSONB storage
    # order preserved: highest savings_ms first (from extract.py)
    transformed_opportunities = []
    for opp in extracted.get('opportunities', []):
        savings = safe_round(opp.get('savings_ms'))
        transformed_opportunities.append({
            'opportunity_id': opp.get('opportunity_id', ''),
            'title':          opp.get('title', ''),
            'description':    opp.get('description', ''),
            'savings_ms':     savings,
            'severity':       get_severity(savings),
            'category':       get_category(
                opp.get('opportunity_id', '')
            ),
            'details':        opp.get('details', None),
        })

    # ── Return clean data ─────────────────────────────
    return {

        # metadata
        'url':       extracted.get('url', None),
        'timestamp': parse_timestamp(
            extracted.get('fetch_time')
        ),

        # scores: 0-1 → 0-100
        'performance_score':    score_to_100(
            extracted.get('performance_score')
        ),
        'accessibility_score':  score_to_100(
            extracted.get('accessibility_score')
        ),
        'best_practices_score': score_to_100(
            extracted.get('best_practices_score')
        ),
        'seo_score':            score_to_100(
            extracted.get('seo_score')
        ),

        # timing metrics rounded to 2 decimals
        'lcp_ms':    safe_round(extracted.get('lcp_ms')),
        'tbt_ms':    safe_round(extracted.get('tbt_ms')),
        'cls_score': safe_round(
            extracted.get('cls_score'), 4
            # CLS needs 4 decimals e.g. 0.1318
        ),
        'fcp_ms':    safe_round(extracted.get('fcp_ms')),
        'si_ms':     safe_round(extracted.get('si_ms')),
        'tti_ms':    safe_round(extracted.get('tti_ms')),
        'ttfb_ms':   safe_round(extracted.get('ttfb_ms')),
        'inp_ms':    safe_round(extracted.get('inp_ms')),

        # resource sizes
        # total_page_size_bytes → KB (÷ 1024)
        'page_size_kb': safe_round(
            safe_float(
                extracted.get('total_page_size_bytes')
            ) / 1024
            if extracted.get('total_page_size_bytes')
            else None
        ),
        'js_size_kb':    safe_round(
            extracted.get('js_size_kb')
        ),
        'css_size_kb':   safe_round(
            extracted.get('css_size_kb')
        ),
        'image_size_kb': safe_round(
            extracted.get('image_size_kb')
        ),
        'total_requests': safe_int(
            extracted.get('total_requests')
        ),

        # opportunities with severity + category added
        # order: highest savings_ms first
        'opportunities': transformed_opportunities,
    }