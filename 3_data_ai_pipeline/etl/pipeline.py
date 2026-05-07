"""
pipeline.py
Master ETL pipeline — connects extract → transform → load.


Modes:
    LOCAL (APP_ENV=development):
    → reads from sample JSON file
    → uses local PostgreSQL
    → run manually: python pipeline.py

    PRODUCTION (APP_ENV=production):
    → reads from luminara_phoo database
    → Phoo inserts metadata + raw JSON
    → ETL fills metrics + opportunities
    → runs automatically via cron job at 2:30am

Flow (Production):
    Phoo's Playwright (2:00am):
    → INSERTs into playwright_runs
    → INSERTs into lighthouse_runs (metadata only)
    → INSERTs into lighthouse_raw_reports (raw JSON)
            ↓
    This ETL (2:30am cron job):
    → READs unprocessed rows (lcp_ms IS NULL)
    → EXTRACTs metrics from raw JSON
    → UPDATEs lighthouse_runs (fills metrics)
    → INSERTs into lighthouse_opportunities
"""

import os
import json
from dotenv import load_dotenv
from extract import extract_from_file, extract_metrics
from transform import transform
from load import (
    load,
    get_db_connection,
    update_playwright_run,
    insert_opportunities
)

load_dotenv()

# reads APP_ENV from .env
# 'development' = local testing
# 'production'  = real server
APP_ENV = os.getenv('APP_ENV', 'development')


def run_pipeline_local():
    print("=" * 50)
    print("ETL PIPELINE — LOCAL MODE")
    print("=" * 50)

    import glob
    # get all JSON files in sample_data folder
    json_files = glob.glob('sample_data/*.json')

    if not json_files:
        print("❌ No JSON files found in sample_data/")
        return

    print(f"Found {len(json_files)} JSON files")

    for filepath in json_files:
        print(f"\n→ Processing: {filepath}")

        with open(filepath, 'r', encoding='utf-8') as f:
            raw_json = json.load(f)

        # detect site_type from filename
        if 'nike' in filepath.lower():
            site_type = 'competitor'
            competitor_name = 'nike_korea'
        else:
            site_type = 'decathlon'
            competitor_name = None

        metadata = {
            'run_type': 'decathlon_daily',
            'site_type': site_type,
            'competitor_name': competitor_name,
            'page_type': 'main',
            'device_type': 'desktop',
            'network_profile': 'WiFi',
            'run_number': 1,
        }

        print(f"→ Site: {metadata['site_type']}")
        print(f"→ Competitor: {metadata['competitor_name']}")

        # Extract
        print(f"\n[1/3] Extracting...")
        extracted = extract_from_file(filepath)
        print(f"✅ {len(extracted['opportunities'])} opportunities")

        # Transform
        print(f"\n[2/3] Transforming...")
        transformed = transform(extracted)
        print(f"✅ Performance: {transformed['performance_score']}")
        print(f"✅ LCP: {transformed['lcp_ms']}ms")

        # Load
        print(f"\n[3/3] Loading...")
        from load import load
        result = load(
            transformed=transformed,
            raw_json=raw_json,
            metadata=metadata
        )

        if result['success']:
            print(f"✅ Loaded! test_id: {result['test_id']}")
        else:
            print(f"❌ Failed: {result['error']}")

    print(f"\n{'=' * 50}")
    print(f"✅ All files processed!")
    print("=" * 50)
def run_pipeline_production():
    """
    Production mode.

    Reads unprocessed rows from luminara_phoo:
    → lighthouse_runs WHERE lcp_ms IS NULL
      (Phoo inserted metadata, ETL fills metrics)
    → joins lighthouse_raw_reports to get raw JSON

    Then:
    → extracts metrics from raw JSON
    → updates lighthouse_runs with metrics
    → inserts into lighthouse_opportunities

    Note:
    → Phoo manages playwright_runs herself
    → ETL only fills metrics + opportunities
    """
    print("=" * 50)
    print("ETL PIPELINE — PRODUCTION MODE")
    print("=" * 50)

    conn = None
    success_count = 0
    failed_count = 0

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # get all unprocessed raw reports
        # unprocessed = lighthouse_runs where lcp_ms IS NULL
        # meaning Phoo inserted metadata but
        # ETL hasn't filled metrics yet
        cursor.execute("""
            SELECT
                lr.test_id,
                lr.site_type,
                lr.competitor_name,
                lr.page_type,
                lr.device_type,
                lr.network_profile,
                lr.run_number,
                lrr.raw_json
            FROM lighthouse_runs lr
            JOIN lighthouse_raw_reports lrr
                ON lr.test_id = lrr.test_id
            WHERE lr.lcp_ms IS NULL
            ORDER BY lr.timestamp ASC
        """)
        # lcp_ms IS NULL = not yet processed by ETL
        # JOIN = get raw_json matching this test

        rows = cursor.fetchall()
        print(f"Found {len(rows)} unprocessed reports")

        for row in rows:
            try:
                (test_id, site_type,
                 competitor_name, page_type,
                 device_type, network_profile,
                 run_number, raw_json) = row

                # STEP 1 — Extract metrics from raw JSON
                extracted = extract_metrics(raw_json)

                # STEP 2 — Transform
                transformed = transform(extracted)

                # STEP 3 — Update existing lighthouse_runs
                # Phoo created row with metadata only
                # ETL fills the NULL metric columns
                cursor.execute("""
                    UPDATE lighthouse_runs SET
                        lcp_ms = %s,
                        tbt_ms = %s,
                        cls_score = %s,
                        fcp_ms = %s,
                        si_ms = %s,
                        tti_ms = %s,
                        ttfb_ms = %s,
                        inp_ms = %s,
                        performance_score = %s,
                        accessibility_score = %s,
                        best_practices_score = %s,
                        seo_score = %s,
                        total_requests = %s,
                        page_size_kb = %s,
                        js_size_kb = %s
                    WHERE test_id = %s
                """, (
                    transformed['lcp_ms'],
                    transformed['tbt_ms'],
                    transformed['cls_score'],
                    transformed['fcp_ms'],
                    transformed['si_ms'],
                    transformed['tti_ms'],
                    transformed['ttfb_ms'],
                    transformed['inp_ms'],
                    transformed['performance_score'],
                    transformed['accessibility_score'],
                    transformed['best_practices_score'],
                    transformed['seo_score'],
                    transformed['total_requests'],
                    transformed['page_size_kb'],
                    transformed['js_size_kb'],
                    test_id
                ))

                # STEP 4 — Insert opportunities
                insert_opportunities(
                    conn, test_id,
                    transformed['opportunities']
                )

                conn.commit()
                success_count += 1
                print(f"✅ Processed test_id: {test_id}")

            except Exception as e:
                conn.rollback()
                failed_count += 1
                print(f"❌ Failed test_id {test_id}: {e}")

    except Exception as e:
        print(f"❌ Pipeline failed: {e}")
        if conn:
            conn.rollback()

    finally:
        if conn:
            conn.close()

    print(f"\n{'=' * 50}")
    print(f"✅ Success: {success_count}")
    print(f"❌ Failed:  {failed_count}")
    print("=" * 50)


if __name__ == '__main__':
    if APP_ENV == 'production':
        run_pipeline_production()
    else:
        run_pipeline_local()