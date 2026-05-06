"""
extract.py
Reads raw Lighthouse JSON from PostgreSQL (lighthouse_raw_reports table)
Extracts key performance metrics and opportunity texts

Flow:
    lighthouse_raw_reports.raw_json (PostgreSQL)
            ↓
    extract_metrics(raw_json)
            ↓
    returns clean dict of metrics + opportunities
"""

import json
import os
from dotenv import load_dotenv

load_dotenv()  # load .env file → DB credentials available


def extract_metrics(raw_json):
    """
    Extract performance metrics from raw Lighthouse JSON
    Input:  raw_json = Lighthouse JSON as Python dict
    Output: dict of clean metrics + sorted opportunities list
    """

    # ─────────────────────────────────────────────────────
    # GET TOP LEVEL SECTIONS FROM RAW JSON
    # ─────────────────────────────────────────────────────

    # audits = detailed results of every individual check
    # Example keys: 'largest-contentful-paint',
    #               'unused-javascript', etc.
    audits = raw_json.get('audits', {})

    # categories = overall grouped scores
    # Example keys: 'performance', 'seo', etc.
    categories = raw_json.get('categories', {})

    # ─────────────────────────────────────────────────────
    # OPPORTUNITIES EXTRACTION
    # ─────────────────────────────────────────────────────
    """
    Loops through EVERY audit in the JSON
    Finds all audits Lighthouse marked
    as 'opportunity' type
    Collects only ones with real savings > 0
    Builds a list of fixable problems
    """

    opportunities = []

    for audit_id, audit in audits.items():
        # audit_id = Lighthouse internal ID
        #            e.g. 'unused-javascript'
        # audit    = audit data dict

        # skip if audit is not a dict
        # (some audit values are not dicts)
        if not isinstance(audit, dict):
            continue

        # check if Lighthouse marked this as 'opportunity'
        # only opportunity type = fixable performance issue
        details = audit.get('details', {})
        if not isinstance(details, dict):
            continue

        if details.get('type') == 'opportunity':
            # get estimated savings in milliseconds
            savings = details.get('overallSavingsMs', 0) or 0

            # only include if savings > 0
            # savings = 0 means no real impact → skip
            if savings > 0:
                opportunities.append({
                    'opportunity_id': audit_id,
                    'title': audit.get('title', ''),
                    'description': audit.get('description', ''),
                    'savings_ms': float(savings),
                    # float() = ensure it is decimal number
                    # not integer
                })

    # sort opportunities by savings_ms highest first
    # RA always picks highest impact fix first
    opportunities_sorted = sorted(
        opportunities,
        key=lambda x: x['savings_ms'],
        reverse=True
        # reverse=True = descending order (highest first)
    )

    # ─────────────────────────────────────────────────────
    # RESOURCE METRICS FROM NETWORK REQUESTS
    # network-requests audit = list of ALL files page loaded
    # each item has: url, resourceType, transferSize
    # ─────────────────────────────────────────────────────

    network_items = (
        audits
        .get('network-requests', {})
        .get('details', {})
        .get('items', [])
    )
    # network_items = list of all loaded files
    # [] = empty list if not found (safe default)

    # calculate total JavaScript size in bytes
    # filter only Script type resources
    # handle both 'Script' and 'script' casing
    # (different Lighthouse versions use different casing)
    js_size_bytes = sum(
        item.get('transferSize', 0)
        for item in network_items
        if isinstance(item, dict)
        and item.get('resourceType', '').lower() == 'script'
        # .lower() = convert to lowercase before comparing
        #            handles 'Script', 'script', 'SCRIPT'
    )
    # convert bytes to KB
    # only if js_size_bytes > 0 (avoid division on empty)
    js_size_kb = round(js_size_bytes / 1024, 2) if js_size_bytes > 0 else None
    # round(..., 2) = keep 2 decimal places
    # Example: 1234.5678 → 1234.57

    # count total network requests
    total_requests = len(network_items) if network_items else None

    # ─────────────────────────────────────────────────────
    # INP — handle both old and new Lighthouse key names
    # old Lighthouse: 'experimental-interaction-to-next-paint'
    # new Lighthouse: 'interaction-to-next-paint'
    # try new key first → fall back to old key
    # ─────────────────────────────────────────────────────

    inp_audit = audits.get(
        'interaction-to-next-paint',
        audits.get('experimental-interaction-to-next-paint', {})
    )
    inp_ms = inp_audit.get('numericValue', None)

    # ─────────────────────────────────────────────────────
    # RETURN ALL EXTRACTED DATA
    # ─────────────────────────────────────────────────────

    return {

        # ── Page metadata ──────────────────────────────────
        'url': raw_json.get(
            'finalDisplayedUrl',
            raw_json.get('finalUrl', None)
        ),
        # try finalDisplayedUrl first (newer Lighthouse)
        # fall back to finalUrl (older Lighthouse)

        'fetch_time': raw_json.get('fetchTime', None),
        # when this audit was run
        # format: "2026-05-06T02:03:45.000Z"
        # transform.py will convert to datetime

        # ── Category scores (raw 0-1 scale) ───────────────
        # transform.py will multiply by 100 → 0-100 scale
        'performance_score': categories.get(
            'performance', {}
        ).get('score', None),
        # overall speed score
        # combines all speed metrics into one number

        'accessibility_score': categories.get(
            'accessibility', {}
        ).get('score', None),
        # how usable for people with disabilities

        'best_practices_score': categories.get(
            'best-practices', {}
        ).get('score', None),
        # follows modern web development standards

        'seo_score': categories.get(
            'seo', {}
        ).get('score', None),
        # how well Google can find and rank this page

        # ── Performance metrics (raw milliseconds) ─────────
        # all values are raw numericValue from Lighthouse
        # no conversion here — transform.py handles that
        'lcp_ms': audits.get(
            'largest-contentful-paint', {}
        ).get('numericValue', None),
        # time until largest visible element loads
        # good threshold: < 2500ms

        'tbt_ms': audits.get(
            'total-blocking-time', {}
        ).get('numericValue', None),
        # total time page was blocked from user input
        # good threshold: < 200ms

        'cls_score': audits.get(
            'cumulative-layout-shift', {}
        ).get('numericValue', None),
        # how much page layout shifts unexpectedly
        # good threshold: < 0.1
        # NOTE: CLS uses numericValue not score
        #       numericValue = actual CLS number (e.g. 0.18)
        #       score = 0-1 rating (we want actual number)

        'fcp_ms': audits.get(
            'first-contentful-paint', {}
        ).get('numericValue', None),
        # time until first content appears on screen
        # good threshold: < 1800ms

        'si_ms': audits.get(
            'speed-index', {}
        ).get('numericValue', None),
        # how quickly page content visually loads
        # good threshold: < 3400ms

        'tti_ms': audits.get(
            'interactive', {}
        ).get('numericValue', None),
        # time until page is fully interactive
        # good threshold: < 3800ms

        'ttfb_ms': audits.get(
            'server-response-time', {}
        ).get('numericValue', None),
        # time until server sends first byte
        # measures server speed
        # good threshold: < 800ms

        'inp_ms': inp_ms,
        # how fast page responds to user interaction
        # good threshold: < 200ms
        # handled separately above (two possible key names)

        # ── Resource metrics ───────────────────────────────
        'total_page_size_bytes': audits.get(
            'total-byte-weight', {}
        ).get('numericValue', None),
        # BYTES not KB — honest naming
        # transform.py will divide by 1024 → KB
        # Example: 2904064 bytes → 2836.0 KB

        'js_size_kb': js_size_kb,
        # total JavaScript size in KB
        # already converted from bytes above
        # large JS = slow page

        'total_requests': total_requests,
        # total number of network requests
        # more requests = slower page

        # ── Opportunities ──────────────────────────────────
        'opportunities': opportunities_sorted,
        # list of fixable issues
        # sorted by savings_ms highest first
        # Lighthouse decides what is an opportunity
        # we do NOT hardcode any IDs
        # Example:
        # [
        #   {
        #     'opportunity_id': 'unused-javascript',
        #     'title': 'Remove unused JavaScript',
        #     'description': 'Reduce unused JS...',
        #     'savings_ms': 540.0
        #   },
        #   {
        #     'opportunity_id': 'uses-webp-images',
        #     'title': 'Serve images in next-gen formats',
        #     'description': 'Image formats like WebP...',
        #     'savings_ms': 480.0
        #   }
        # ]
    }


def extract_from_file(filepath):
    """
    Read Lighthouse JSON file from disk and extract metrics
    Input:  filepath = path to raw Lighthouse JSON file
                       Example: 'sample_data/lighthouse.json'
    Output: extracted metrics dict

    Used for:
    → local testing with sample JSON file
    → before real PostgreSQL DB is ready
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        # open file in read mode
        # encoding='utf-8' handles Korean characters
        # 'with' automatically closes file when done
        raw_json = json.load(f)
        # json.load = read JSON from file object
        #             converts JSON text → Python dict
    return extract_metrics(raw_json)


def extract_from_db_json(raw_json_str):
    """
    Extract metrics from raw JSON from PostgreSQL
    Input:  raw_json_str = value from
                           lighthouse_raw_reports.raw_json
                           can be dict or string
    Output: extracted metrics dict

    Used for:
    → production ETL
    → reads from lighthouse_raw_reports table
    """
    if isinstance(raw_json_str, dict):
        # psycopg2 sometimes auto-converts JSONB → dict
        # if already dict → use directly
        raw_json = raw_json_str
    else:
        # still a JSON string → convert to dict
        # json.loads = load from string
        # json.load  = load from file
        raw_json = json.loads(raw_json_str)

    return extract_metrics(raw_json)