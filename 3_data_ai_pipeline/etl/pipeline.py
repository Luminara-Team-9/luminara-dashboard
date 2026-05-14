"""
pipeline.py
Master ETL pipeline — connects extract → transform → load.
"""

import json
import argparse
from dotenv import load_dotenv

from extract import extract_metrics
from transform import transform
from load import (
    load,
    get_db_connection,
    update_playwright_run,
    insert_opportunities,
    delete_opportunities_for_test,
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
    playwright_run_id=None,
):
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

    run_type = (
        "competitor_scan"
        if site_type == "competitor"
        else "decathlon_daily"
    )

    with open(filepath, "r", encoding="utf-8") as f:
        raw_json = json.load(f)

    print("\n[1/3] Extracting...")
    extracted = extract_metrics(raw_json)
    print(f"✅ URL:           {extracted.get('url')}")
    print(f"✅ Opportunities: {len(extracted['opportunities'])}")

    print("\n[2/3] Transforming...")
    transformed = transform(extracted)
    print(f"✅ Performance:   {transformed['performance_score']}")
    print(f"✅ LCP:           {transformed['lcp_ms']}ms")
    print(f"✅ TBT:           {transformed['tbt_ms']}ms")

    metadata = {
        "run_type": run_type,
        "site_type": site_type,
        "competitor_name": competitor_name,
        "page_type": page_type,
        "device_type": device_type,
        "network_profile": network_profile,
        "run_number": run_number,
        "url": extracted.get("url"),
    }

    print("\n[3/3] Loading into core_db...")
    result = load(
        transformed=transformed,
        raw_json=raw_json,
        metadata=metadata,
        playwright_run_id=playwright_run_id,
    )

    print(f"\n{'=' * 50}")
    if result["success"]:
        print("✅ Pipeline completed!")
        print(f"   playwright_run_id: {result['playwright_run_id']}")
        print(f"   test_id:           {result['test_id']}")
    else:
        print(f"❌ Pipeline failed: {result.get('error')}")
    print("=" * 50)

    return result


def run_auto():
    """
    AUTO mode.

    Processes:
    1. new raw reports with no opportunities yet
    2. old incomplete rows where key Lighthouse metrics are NULL
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
            WHERE
                NOT EXISTS (
                    SELECT 1
                    FROM lighthouse_opportunities lo
                    WHERE lo.test_id = lr.test_id
                )
                OR lr.lcp_ms IS NULL
                OR lr.tbt_ms IS NULL
                OR lr.cls_score IS NULL
                OR lr.fcp_ms IS NULL
                OR lr.si_ms IS NULL
                OR lr.tti_ms IS NULL
                OR lr.ttfb_ms IS NULL
                OR lr.performance_score IS NULL
                OR lr.accessibility_score IS NULL
                OR lr.best_practices_score IS NULL
                OR lr.seo_score IS NULL
            ORDER BY lr.timestamp ASC
        """)

        rows = cursor.fetchall()
        print(f"Found {len(rows)} reports to process/reprocess")

        if len(rows) == 0:
            print("✅ Nothing to process — all up to date!")
            return

        playwright_run_ids = set()

        for row in rows:
            (
                test_id,
                playwright_run_id,
                site_type,
                competitor_name,
                page_type,
                device_type,
                network_profile,
                run_number,
                raw_json,
            ) = row

            try:
                print(f"\n→ Processing test_id: {test_id}")

                extracted = extract_metrics(raw_json)
                transformed = transform(extracted)

                cursor.execute("""
                    UPDATE lighthouse_runs SET
                        timestamp            = COALESCE(%s, timestamp),
                        lcp_ms               = %s,
                        tbt_ms               = %s,
                        cls_score            = %s,
                        fcp_ms               = %s,
                        si_ms                = %s,
                        tti_ms               = %s,
                        ttfb_ms              = %s,
                        inp_ms               = %s,
                        performance_score    = %s,
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
                    transformed["timestamp"],
                    transformed["lcp_ms"],
                    transformed["tbt_ms"],
                    transformed["cls_score"],
                    transformed["fcp_ms"],
                    transformed["si_ms"],
                    transformed["tti_ms"],
                    transformed["ttfb_ms"],
                    transformed["inp_ms"],
                    transformed["performance_score"],
                    transformed["accessibility_score"],
                    transformed["best_practices_score"],
                    transformed["seo_score"],
                    transformed["total_requests"],
                    transformed["page_size_kb"],
                    transformed["js_size_kb"],
                    transformed["css_size_kb"],
                    transformed["image_size_kb"],
                    test_id,
                ))

                # Important:
                # Reprocessing same test_id should replace old opportunities,
                # not append duplicates.
                delete_opportunities_for_test(conn, test_id)

                insert_opportunities(
                    conn,
                    test_id,
                    transformed["opportunities"],
                )

                conn.commit()
                success_count += 1

                if playwright_run_id is not None:
                    playwright_run_ids.add(playwright_run_id)

                print(f"✅ test_id {test_id} done")
                print(f"   performance: {transformed['performance_score']}")
                print(f"   accessibility: {transformed['accessibility_score']}")
                print(f"   best_practices: {transformed['best_practices_score']}")
                print(f"   seo: {transformed['seo_score']}")
                print(f"   opportunities: {len(transformed['opportunities'])}")

            except Exception as e:
                conn.rollback()
                failed_count += 1
                print(f"❌ test_id {test_id} failed: {e}")

        for pr_id in playwright_run_ids:
            update_playwright_run(
                conn,
                pr_id,
                success_count,
                failed_count,
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Luminara ETL Pipeline"
    )

    parser.add_argument(
        "--auto",
        action="store_true",
        help="Auto mode: process unprocessed or incomplete rows from DB",
    )

    parser.add_argument("--file", help="Path to Lighthouse JSON file")
    parser.add_argument(
        "--site_type",
        choices=["decathlon", "competitor"],
        help="decathlon or competitor",
    )
    parser.add_argument("--page_type", help="main, product, cart etc.")
    parser.add_argument(
        "--device_type",
        choices=["mobile", "desktop"],
        help="mobile or desktop",
    )
    parser.add_argument(
        "--run_number",
        type=int,
        default=1,
        help="Run number 1, 2, or 3",
    )
    parser.add_argument(
        "--competitor_name",
        default=None,
        help="nike, adidas etc.",
    )
    parser.add_argument(
        "--network_profile",
        default=None,
        help="WiFi, 4G etc.",
    )

    args = parser.parse_args()

    if args.auto:
        run_auto()

    elif args.file:
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