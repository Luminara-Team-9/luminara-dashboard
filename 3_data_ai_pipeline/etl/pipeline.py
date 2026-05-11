"""
pipeline.py
Master ETL pipeline — connects extract → transform → load.

Two modes:

    MANUAL (--file):
        Test pipeline with one real Lighthouse JSON file.
        Use this before Phoo's automation is ready.

        python pipeline.py \
            --file path/to/lighthouse.json \
            --site_type decathlon \
            --page_type main \
            --device_type mobile \
            --run_number 1

    AUTO (--auto):
        Reads ALL unprocessed raw JSON from core_db.
        Runs automatically via cron job every night.
        Use this after Phoo's automation is ready.

        python pipeline.py --auto
        Cron: 30 2 * * * python pipeline.py --auto

Flow:
    raw Lighthouse JSON
            ↓
    extract_metrics() → transform() → load()
            ↓
    core_db:
    → playwright_runs
    → lighthouse_runs
    → lighthouse_raw_reports
    → lighthouse_opportunities
"""

import os
import json
import argparse
from dotenv import load_dotenv
from extract import extract_metrics
from transform import transform
from load import (
    load,
    get_db_connection,
    update_playwright_run,
)

load_dotenv()


def run_pipeline(
    filepath,
    site_type,
    page_type,
    device_type,
    run_number,
    competitor_name=None,
    network_profile=None,
    playwright_run_id=None
):
    """
    Run full ETL pipeline on one Lighthouse JSON file.

    Args:
        filepath:          path to Lighthouse JSON file
        site_type:         'decathlon' or 'competitor'
        page_type:         'main', 'product', 'cart' etc.
        device_type:       'mobile' or 'desktop'
        run_number:        1, 2, or 3
        competitor_name:   'nike', 'adidas' etc. (None for Decathlon)
        network_profile:   'WiFi', '4G' etc. (None if unknown)
        playwright_run_id: continue existing session or None = new

    Returns:
        dict with success, playwright_run_id, test_id
    """
    print("=" * 50)
    print("ETL PIPELINE — MANUAL MODE")
    print("=" * 50)
    print(f"→ File:       {filepath}")
    print(f"→ Site:       {site_type}")
    print(f"→ Page:       {page_type}")
    print(f"→ Device:     {device_type}")
    print(f"→ Run:        {run_number}")
    if competitor_name:
        print(f"→ Competitor: {competitor_name}")

    # run_type based on site_type
    run_type = (
        'competitor_scan'
        if site_type == 'competitor'
        else 'decathlon_daily'
    )

    # read raw JSON from file
    with open(filepath, 'r', encoding='utf-8') as f:
        raw_json = json.load(f)

    # STEP 1 — Extract
    print(f"\n[1/3] Extracting...")
    extracted = extract_metrics(raw_json)
    print(f"✅ URL:           {extracted.get('url')}")
    print(f"✅ Opportunities: {len(extracted['opportunities'])}")

    # STEP 2 — Transform
    print(f"\n[2/3] Transforming...")
    transformed = transform(extracted)
    print(f"✅ Performance:   {transformed['performance_score']}")
    print(f"✅ LCP:           {transformed['lcp_ms']}ms")
    print(f"✅ TBT:           {transformed['tbt_ms']}ms")

    # metadata from args + url from JSON
    metadata = {
        'run_type':        run_type,
        'site_type':       site_type,
        'competitor_name': competitor_name,
        'page_type':       page_type,
        'device_type':     device_type,
        'network_profile': network_profile,
        'run_number':      run_number,
        'url':             extracted.get('url'),
    }

    # STEP 3 — Load into core_db
    print(f"\n[3/3] Loading into core_db...")
    result = load(
        transformed=transformed,
        raw_json=raw_json,
        metadata=metadata,
        playwright_run_id=playwright_run_id
    )

    print(f"\n{'=' * 50}")
    if result['success']:
        print(f"✅ Pipeline completed!")
        print(f"   playwright_run_id: {result['playwright_run_id']}")
        print(f"   test_id:           {result['test_id']}")
    else:
        print(f"❌ Pipeline failed: {result.get('error')}")
    print("=" * 50)

    return result


def run_auto():
    """
    AUTO mode — for cron job daily use.
    Reads ALL unprocessed raw JSON from core_db.
    Unprocessed = lighthouse_raw_reports rows
                  where lighthouse_runs.lcp_ms IS NULL.

    Phoo's automation inserts:
    → playwright_runs (session info)
    → lighthouse_runs (metadata only, metrics = NULL)
    → lighthouse_raw_reports (raw JSON)

    This ETL fills:
    → lighthouse_runs (metrics columns)
    → lighthouse_opportunities (fixable issues)
    """
    print("=" * 50)
    print("ETL PIPELINE — AUTO MODE")
    print("=" * 50)

    conn = None
    success_count = 0
    failed_count = 0

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # get all unprocessed raw reports
        # unprocessed = lcp_ms IS NULL
        # meaning Phoo inserted metadata but ETL hasn't run yet
        cursor.execute("""
            SELECT
                lr.test_id,
                lr.playwright_run_id,
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
            WHERE NOT EXISTS (
                SELECT 1 FROM lighthouse_opportunities lo
                WHERE lo.test_id = lr.test_id
            )
            ORDER BY lr.timestamp ASC
        """)

        rows = cursor.fetchall()
        print(f"Found {len(rows)} unprocessed reports")

        if len(rows) == 0:
            print("✅ Nothing to process — all up to date!")
            return

        # track unique playwright_run_ids for status update
        playwright_run_ids = set()

        for row in rows:
            (test_id, playwright_run_id,
             site_type, competitor_name,
             page_type, device_type,
             network_profile, run_number,
             raw_json) = row

            try:
                print(f"\n→ Processing test_id: {test_id}")

                # STEP 1 — Extract from raw JSON
                extracted = extract_metrics(raw_json)

                # STEP 2 — Transform
                transformed = transform(extracted)

                # STEP 3 — Update lighthouse_runs metrics
                # Phoo created row with metadata only
                # ETL fills NULL metric columns
                cursor.execute("""
                    UPDATE lighthouse_runs SET
                        inp_ms               = %s,
                        accessibility_score  = %s,
                        best_practices_score = %s,
                        seo_score            = %s,
                        total_requests       = %s,
                        page_size_kb         = %s,
                        js_size_kb           = %s,
                        css_size_kb          = %s,
                        image_size_kb        = %s
                    WHERE test_id = %s
                """, (
                    transformed['inp_ms'],
                    transformed['accessibility_score'],
                    transformed['best_practices_score'],
                    transformed['seo_score'],
                    transformed['total_requests'],
                    transformed['page_size_kb'],
                    transformed['js_size_kb'],
                    transformed['css_size_kb'],
                    transformed['image_size_kb'],
                    test_id,
                ))

                # STEP 4 — Insert opportunities
                from load import insert_opportunities
                insert_opportunities(
                    conn, test_id,
                    transformed['opportunities']
                )

                conn.commit()
                success_count += 1
                playwright_run_ids.add(playwright_run_id)
                print(f"✅ test_id {test_id} done")
                print(f"   performance: {transformed['performance_score']}")
                print(f"   opportunities: {len(transformed['opportunities'])}")

            except Exception as e:
                conn.rollback()
                failed_count += 1
                print(f"❌ test_id {test_id} failed: {e}")

        # update all playwright_run sessions status
        for pr_id in playwright_run_ids:
            update_playwright_run(
                conn, pr_id,
                success_count, failed_count
            )
        conn.commit()

    except Exception as e:
        print(f"❌ Auto pipeline failed: {e}")
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
    parser = argparse.ArgumentParser(
        description='Luminara ETL Pipeline'
    )

    # mode selection
    parser.add_argument(
        '--auto', action='store_true',
        help='Auto mode: process all unprocessed rows from DB'
    )

    # manual mode args
    parser.add_argument(
        '--file',
        help='Path to Lighthouse JSON file (manual mode)'
    )
    parser.add_argument(
        '--site_type',
        choices=['decathlon', 'competitor'],
        help='decathlon or competitor'
    )
    parser.add_argument(
        '--page_type',
        help='main, product, cart etc.'
    )
    parser.add_argument(
        '--device_type',
        choices=['mobile', 'desktop'],
        help='mobile or desktop'
    )
    parser.add_argument(
        '--run_number', type=int, default=1,
        help='Run number 1, 2, or 3'
    )
    parser.add_argument(
        '--competitor_name', default=None,
        help='nike, adidas etc.'
    )
    parser.add_argument(
        '--network_profile', default=None,
        help='WiFi, 4G etc.'
    )

    args = parser.parse_args()

    if args.auto:
        # AUTO mode — cron job daily
        run_auto()

    elif args.file:
        # MANUAL mode — test with one JSON file
        if not all([args.site_type, args.page_type, args.device_type]):
            print("❌ Manual mode requires:")
            print("   --site_type, --page_type, --device_type")
        else:
            run_pipeline(
                filepath=args.file,
                site_type=args.site_type,
                page_type=args.page_type,
                device_type=args.device_type,
                run_number=args.run_number,
                competitor_name=args.competitor_name,
                network_profile=args.network_profile,
            )

    else:
        print("❌ Please specify mode:")
        print("   Manual: --file lighthouse.json --site_type ...")
        print("   Auto:   --auto")