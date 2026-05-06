"""
transform.py
Cleans and validates extracted Lighthouse metrics
Prepares data for loading into PostgreSQL

Flow:
    extract.py output (raw dict)
            ↓
    transform(extracted)
            ↓
    clean validated dict
    ready for load.py
"""

import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()


def transform(extracted):
    """
    Clean and validate extracted Lighthouse metrics
    Input:  extracted = raw dict from extract.py
    Output: clean validated dict ready for PostgreSQL
    """

    # ─────────────────────────────────────────────────────
    # HELPER FUNCTIONS
    # ─────────────────────────────────────────────────────

    def safe_float(value):
        """
        Safely convert value to float
        Returns None if conversion fails
        """
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def safe_int(value):
        """
        Safely convert value to int
        Returns None if conversion fails
        Used for total_requests
        """
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

    def safe_round(value, decimals=2):
        """
        Safely convert and round float value
        Returns None if value is None
        decimals = number of decimal places
        Example: 4039.58755 → 4039.59
        """
        if value is None:
            return None
        try:
            return round(float(value), decimals)
        except (ValueError, TypeError):
            return None

    def score_to_100(value):
        """
        Convert Lighthouse score from 0-1 to 0-100
        Example: 0.33 → 33.0
        Returns None if value is None
        """
        if value is None:
            return None
        try:
            return round(float(value) * 100, 1)
            # round to 1 decimal place
            # Example: 0.336 → 33.6
        except (ValueError, TypeError):
            return None

    def parse_timestamp(fetch_time):
        """
        Convert Lighthouse fetchTime string to datetime
        Input:  "2026-05-05T18:02:51.468Z"
        Output: datetime object with UTC timezone
        Returns None if parsing fails
        """
        if fetch_time is None:
            return None
        try:
            return datetime.strptime(
                fetch_time,
                '%Y-%m-%dT%H:%M:%S.%fZ'
            ).replace(tzinfo=timezone.utc)
            # %Y = year  (2026)
            # %m = month (05)
            # %d = day   (05)
            # %H = hour  (18)
            # %M = minute(02)
            # %S = second(51)
            # %f = microseconds (468000)
            # timezone.utc = set UTC timezone
        except (ValueError, TypeError):
            return None

    def get_severity(savings_ms):
        """
        Assign severity level based on savings_ms
        high   = savings > 500ms  (critical fix)
        medium = savings 200-500ms (important fix)
        low    = savings < 200ms  (minor fix)
        """
        if savings_ms is None:
            return 'low'
        if savings_ms > 500:
            return 'high'
        elif savings_ms >= 200:
            return 'medium'
        else:
            return 'low'

    # ─────────────────────────────────────────────────────
    # TRANSFORM OPPORTUNITIES
    # Add severity to each opportunity
    # Round savings_ms to 2 decimal places
    # ─────────────────────────────────────────────────────

    transformed_opportunities = []
    for opp in extracted.get('opportunities', []):
        savings = safe_round(opp.get('savings_ms'))
        transformed_opportunities.append({
            'opportunity_id': opp.get('opportunity_id', ''),
            'title': opp.get('title', ''),
            'description': opp.get('description', ''),
            'savings_ms': savings,
            'severity': get_severity(savings),
            # severity added here based on savings_ms
        })

    # ─────────────────────────────────────────────────────
    # RETURN CLEAN TRANSFORMED DATA
    # All values validated, converted and rounded
    # Ready to insert into PostgreSQL
    # ─────────────────────────────────────────────────────

    return {

        # ── Page metadata ──────────────────────────────────
        'url': extracted.get('url', None),
        # keep as is — already clean string

        'timestamp': parse_timestamp(
            extracted.get('fetch_time')
        ),
        # RENAMED: fetch_time → timestamp
        # CONVERTED: string → datetime object
        # MATCHES: lighthouse_runs.timestamp column

        # ── Category scores (converted 0-1 → 0-100) ───────
        'performance_score': score_to_100(
            extracted.get('performance_score')
        ),
        # Example: 0.33 → 33.0

        'accessibility_score': score_to_100(
            extracted.get('accessibility_score')
        ),
        # Example: 0.72 → 72.0

        'best_practices_score': score_to_100(
            extracted.get('best_practices_score')
        ),
        # Example: 0.50 → 50.0

        'seo_score': score_to_100(
            extracted.get('seo_score')
        ),
        # Example: 0.92 → 92.0

        # ── Performance metrics (rounded to 2 decimals) ────
        'lcp_ms': safe_round(extracted.get('lcp_ms')),
        # Example: 4039.58755 → 4039.59ms

        'tbt_ms': safe_round(extracted.get('tbt_ms')),
        # Example: 3979.9821 → 3979.98ms

        'cls_score': safe_round(
            extracted.get('cls_score'), 4
        ),
        # CLS uses 4 decimal places
        # Example: 0.13184200 → 0.1318
        # (CLS is a small number, needs more precision)

        'fcp_ms': safe_round(extracted.get('fcp_ms')),
        # Example: 973.3748 → 973.37ms

        'si_ms': safe_round(extracted.get('si_ms')),
        # Example: 10440.058 → 10440.06ms

        'tti_ms': safe_round(extracted.get('tti_ms')),
        # Example: 15571.507 → 15571.51ms

        'ttfb_ms': safe_round(extracted.get('ttfb_ms')),
        # Example: 230.0 → 230.0ms

        'inp_ms': safe_round(extracted.get('inp_ms')),
        # None if Lighthouse didn't measure INP
        # safe_round handles None gracefully → None

        # ── Resource metrics ───────────────────────────────
        'page_size_kb': safe_round(
            safe_float(
                extracted.get('total_page_size_bytes')
            ) / 1024
            if extracted.get('total_page_size_bytes')
            else None
        ),
        # RENAMED: total_page_size_bytes → page_size_kb
        # CONVERTED: bytes → KB (divide by 1024)
        # ROUNDED: 2 decimal places
        # MATCHES: lighthouse_runs.page_size_kb column
        # Example: 4714279 bytes → 4603.79 KB

        'js_size_kb': safe_round(
            extracted.get('js_size_kb')
        ),
        # already in KB from extract.py
        # just round to 2 decimal places
        # Example: 2526.47KB

        'total_requests': safe_int(
            extracted.get('total_requests')
        ),
        # validate as integer
        # Example: 234

        # ── Opportunities (with severity added) ────────────
        'opportunities': transformed_opportunities,
        # list of opportunities with severity:
        # [
        #   {
        #     'opportunity_id': 'unused-javascript',
        #     'title': 'Remove unused JavaScript',
        #     'description': '...',
        #     'savings_ms': 420.0,
        #     'severity': 'medium' ← added here
        #   }
        # ]
    }