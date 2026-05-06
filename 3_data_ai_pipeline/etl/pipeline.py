"""
pipeline.py
Master ETL pipeline script
Connects extract → transform → load

LOCAL mode (development):
→ reads from sample JSON file on disk
→ uses local PostgreSQL

PRODUCTION mode:
→ reads from lighthouse_raw_reports table
→ uses NAS PostgreSQL
→ runs automatically via cron job

Usage:
    python pipeline.py
"""

import os
import json
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
from extract import extract_from_file, extract_metrics
from transform import transform
from load import load, get_db_connection, create_playwright_run, update_playwright_run

load_dotenv()

# ─────────────────────────────────────────────────────
# ENVIRONMENT DETECTION
# reads APP_ENV from .env file
# development = local testing
# production  = real server
# ─────────────────────────────────────────────────────
APP_ENV = os.getenv('APP_ENV', 'development')


def run_pipeline_local():
    """
    LOCAL mode — reads from sample JSON file
    Used for testing before real DB is ready

    WHEN TO USE:
    → APP_ENV=development in .env
    → testing ETL logic locally
    """
    print("=" * 50)
    print("ETL PIPELINE — LOCAL MODE")
    print("=" * 50)

    # sample JSON file path
    filepath = 'sample_data/decathlon_sample.json'

    # check if sample file exists
    if not os.path.exists(filepath):
        print(f"❌ Sample file not found: {filepath}")
        print("Please add a Lighthouse JSON file to sample_data/")
        return

    # read raw JSON for inserting into lighthouse_raw_reports
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_json = json.load(f)

    # sample metadata
    # in production → Phoo provides these values
    metadata = {
        'run_type': 'decathlon_daily',
        'site_type': 'decathlon',
        'competitor_name': None,
        'page_type': 'main',
        'device_type': 'desktop',
        'network_profile': 'WiFi',
        'run_number': 1,
    }

    print(f"\n→ Reading: {filepath}")
    print(f"→ Site: {metadata['site_type']}")
    print(f"→ Page: {metadata['page_type']}")
    print(f"→ Device: {metadata['device_type']}")

    # STEP 1 — Extract
    print(f"\n[1/3] Extracting metrics...")
    extracted = extract_from_file(filepath)
    print(f"✅ Extracted {len(extracted['opportunities'])} opportunities")

    # STEP 2 — Transform
    print(f"\n[2/3] Transforming data...")
    transformed = transform(extracted)
    print(f"✅ Performance score: {transformed['performance_score']}")
    print(f"✅ LCP: {transformed['lcp_ms']}ms")
    print(f"✅ Page size: {transformed['page_size_kb']}KB")

    # STEP 3 — Load
    print(f"\n[3/3] Loading into PostgreSQL...")
    result = load(
        transformed=transformed,
        raw_json=raw_json,
        metadata=metadata
    )

    # show final result
    print(f"\n{'=' * 50}")
    if result['success']:
        print(f"✅ Pipeline completed successfully!")
        print(f"   playwright_run_id: {result['playwright_run_id']}")
        print(f"   test_id: {result['test_id']}")
    else:
        print(f"❌ Pipeline failed!")
        print(f"   Error: {result['error']}")
    print("=" * 50)


# ─────────────────────────────────────────────────────
# PRODUCTION PIPELINE
# NOT READY YET
# Uncomment when real PostgreSQL DB is ready
# and lighthouse_raw_reports has real data from Phoo
# ─────────────────────────────────────────────────────
# def run_pipeline_production():
#     """
#     PRODUCTION mode — reads from PostgreSQL
#     Processes all unprocessed raw reports
#
#     WHEN TO USE:
#     → APP_ENV=production in .env
#     → real server with real data
#     → runs via cron job automatically
#     """
#     print("=" * 50)
#     print("ETL PIPELINE — PRODUCTION MODE")
#     print("=" * 50)
#
#     conn = None
#     success_count = 0
#     failed_count = 0
#     playwright_run_id = None
#
#     try:
#         conn = get_db_connection()
#         cursor = conn.cursor()
#
#         # create playwright session
#         playwright_run_id = create_playwright_run(
#             conn, 'decathlon_daily'
#         )
#
#         # get all unprocessed raw reports
#         # unprocessed = lighthouse_runs.lcp_ms IS NULL
#         # (Phoo inserted basic metadata but ETL
#         #  hasn't filled metrics yet)
#         cursor.execute("""
#             SELECT
#                 lr.test_id,
#                 lr.url,
#                 lr.site_type,
#                 lr.competitor_name,
#                 lr.page_type,
#                 lr.device_type,
#                 lr.network_profile,
#                 lr.run_number,
#                 lrr.raw_json
#             FROM lighthouse_runs lr
#             JOIN lighthouse_raw_reports lrr
#                 ON lr.test_id = lrr.test_id
#             WHERE lr.lcp_ms IS NULL
#             ORDER BY lr.timestamp ASC
#         """)
#         # lcp_ms IS NULL = not yet processed by ETL
#
#         rows = cursor.fetchall()
#         print(f"Found {len(rows)} unprocessed reports")
#
#         for row in rows:
#             try:
#                 (test_id, url, site_type,
#                  competitor_name, page_type,
#                  device_type, network_profile,
#                  run_number, raw_json) = row
#
#                 # extract metrics from raw JSON
#                 extracted = extract_metrics(raw_json)
#
#                 # transform
#                 transformed = transform(extracted)
#
#                 # update existing lighthouse_runs row
#                 # with extracted metrics
#                 cursor.execute("""
#                     UPDATE lighthouse_runs SET
#                         lcp_ms = %s,
#                         tbt_ms = %s,
#                         cls_score = %s,
#                         fcp_ms = %s,
#                         si_ms = %s,
#                         tti_ms = %s,
#                         ttfb_ms = %s,
#                         inp_ms = %s,
#                         performance_score = %s,
#                         accessibility_score = %s,
#                         best_practices_score = %s,
#                         seo_score = %s,
#                         total_requests = %s,
#                         page_size_kb = %s,
#                         js_size_kb = %s
#                     WHERE test_id = %s
#                 """, (
#                     transformed['lcp_ms'],
#                     transformed['tbt_ms'],
#                     transformed['cls_score'],
#                     transformed['fcp_ms'],
#                     transformed['si_ms'],
#                     transformed['tti_ms'],
#                     transformed['ttfb_ms'],
#                     transformed['inp_ms'],
#                     transformed['performance_score'],
#                     transformed['accessibility_score'],
#                     transformed['best_practices_score'],
#                     transformed['seo_score'],
#                     transformed['total_requests'],
#                     transformed['page_size_kb'],
#                     transformed['js_size_kb'],
#                     test_id
#                 ))
#
#                 # insert opportunities
#                 from load import insert_opportunities
#                 insert_opportunities(
#                     conn, test_id,
#                     transformed['opportunities']
#                 )
#
#                 conn.commit()
#                 success_count += 1
#                 print(f"✅ Processed test_id: {test_id}")
#
#             except Exception as e:
#                 conn.rollback()
#                 failed_count += 1
#                 print(f"❌ Failed test_id {test_id}: {e}")
#
#         # update playwright_run status
#         update_playwright_run(
#             conn, playwright_run_id,
#             success_count, failed_count
#         )
#         conn.commit()
#
#     except Exception as e:
#         print(f"❌ Pipeline failed: {e}")
#         if conn:
#             conn.rollback()
#
#     finally:
#         if conn:
#             conn.close()
#
#     print(f"\n{'=' * 50}")
#     print(f"✅ Success: {success_count}")
#     print(f"❌ Failed:  {failed_count}")
#     print("=" * 50)


# ─────────────────────────────────────────────────────
# MAIN ENTRY POINT
# detects environment and runs correct pipeline
# ─────────────────────────────────────────────────────
if __name__ == '__main__':
    # __name__ == '__main__' means:
    # this file is being run directly
    # not imported by another file

    if APP_ENV == 'production':
        # production mode — not ready yet
        print("Production mode not ready yet!")
        print("Uncomment run_pipeline_production()")
    else:
        # development mode — local testing
        run_pipeline_local()