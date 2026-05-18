"""
embed.py
RAG Knowledge Base Builder.
Embeds documents into rag_documents table using BGE-M3.

Sources:
    1. Hardcoded CWV guides (one-time, never changes)
    2. lighthouse_opportunities from DB (re-run when new scans added)
    3. Competitor benchmarks from DB (re-run when new scans added)

Flow:
    documents → BGE-M3 (1024-dim vectors) → rag_documents table
"""

import os
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()


# ── DB Connection ─────────────────────────────────────────────────────────────

def get_db_connection():
    """Connect to core_db."""
    return psycopg2.connect(
        host=os.getenv('HOST_IP'),
        port=os.getenv('PGPORT', '5432'),
        dbname=os.getenv('POSTGRES_DB'),
        user=os.getenv('POSTGRES_USER'),
        password=os.getenv('POSTGRES_PASSWORD')
    )


# ── BGE-M3 Model ──────────────────────────────────────────────────────────────

def load_model():
    """Load BGE-M3 embedding model."""
    print("Loading BGE-M3 model...")
    model = SentenceTransformer('BAAI/bge-m3')
    print(f"✅ BGE-M3 loaded — dim: {model.get_embedding_dimension()}")
    return model


def embed_text(model, text):
    """Convert text → 1024-dim vector."""
    return model.encode(text, normalize_embeddings=True).tolist()


# ── Insert Helper ─────────────────────────────────────────────────────────────

def insert_document(cursor, title, content, source,
                    doc_type, embedding, metadata=None):
    """
    Upsert document — update if exists, insert if not.
    Always keeps latest data.
    """
    cursor.execute("""
        INSERT INTO rag_documents (
            title, content, embedding,
            source, doc_type, metadata,
            updated_at
        ) VALUES (%s, %s, %s::vector, %s, %s, %s, NOW())
        ON CONFLICT (source)
        DO UPDATE SET
            content    = EXCLUDED.content,
            embedding  = EXCLUDED.embedding,
            metadata   = EXCLUDED.metadata,
            updated_at = NOW()
    """, (
        title,
        content,
        str(embedding),
        source,
        doc_type,
        Json(metadata) if metadata else None,
    ))
    return cursor.rowcount == 1


# ── Source 1: Hardcoded CWV Guides ───────────────────────────────────────────

CWV_GUIDES = [
    {
        "title": "LCP Overview and Thresholds",
        "content": (
            "Largest Contentful Paint (LCP) measures how long it takes "
            "for the largest visible content element to load. "
            "Good: under 2500ms. Needs improvement: 2500-4000ms. "
            "Poor: over 4000ms. LCP is the most important Core Web Vital "
            "for user experience and Google search ranking."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "LCP Common Causes",
        "content": (
            "Common causes of slow LCP: "
            "1. Large hero images not optimized. "
            "2. Render-blocking JavaScript and CSS in the head. "
            "3. Slow server response time (TTFB over 800ms). "
            "4. Client-side rendering delaying content paint. "
            "5. Images without proper width and height attributes causing reflow."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "LCP Fix: Optimize Hero Images",
        "content": (
            "To fix slow LCP caused by large images: "
            "Convert images to WebP or AVIF format (50-80% smaller). "
            "Add loading='eager' and fetchpriority='high' to hero image. "
            "Use srcset for responsive images. "
            "Preload the LCP image with <link rel=preload>. "
            "Compress images to under 200KB for hero images."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "LCP Fix: Remove Render-Blocking Resources",
        "content": (
            "To fix LCP caused by render-blocking resources: "
            "Add defer or async attribute to non-critical scripts. "
            "Move scripts to end of body tag. "
            "Use <link rel=preload> for critical CSS. "
            "Inline critical CSS directly in the head. "
            "Remove unused CSS and JavaScript files. "
            "Expected improvement: 500ms-2000ms reduction in LCP."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "TBT Overview and Thresholds",
        "content": (
            "Total Blocking Time (TBT) measures how long the main thread "
            "is blocked, preventing user interaction. "
            "Good: under 200ms. Needs improvement: 200-600ms. "
            "Poor: over 600ms. High TBT makes pages feel unresponsive. "
            "TBT is caused by long JavaScript tasks on the main thread."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "TBT Fix: Reduce JavaScript Execution",
        "content": (
            "To fix high TBT: "
            "Remove unused JavaScript — use code splitting. "
            "Defer non-critical JavaScript with defer attribute. "
            "Break up long tasks into smaller async tasks. "
            "Use web workers for heavy computation. "
            "Minify and compress JavaScript files. "
            "Remove or replace heavy third-party scripts. "
            "Expected improvement: reducing 50KB of JS reduces TBT by 100-500ms."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "CLS Overview and Thresholds",
        "content": (
            "Cumulative Layout Shift (CLS) measures unexpected layout shifts "
            "during page load. "
            "Good: under 0.1. Needs improvement: 0.1-0.25. "
            "Poor: over 0.25. High CLS means elements jump around, "
            "causing bad user experience and accidental clicks."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "CLS Fix: Set Image Dimensions",
        "content": (
            "To fix high CLS: "
            "Always set width and height attributes on images and videos. "
            "Use aspect-ratio CSS property for responsive media. "
            "Reserve space for ads and embeds with min-height. "
            "Avoid inserting content above existing content after load. "
            "Use transform animations instead of layout-triggering properties. "
            "Preload web fonts to prevent font swap layout shifts."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "FCP Overview and Thresholds",
        "content": (
            "First Contentful Paint (FCP) measures when the first text "
            "or image is painted on screen. "
            "Good: under 1800ms. Needs improvement: 1800-3000ms. "
            "Poor: over 3000ms. Fast FCP gives users confidence the page is loading."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "FCP Fix: Eliminate Render-Blocking CSS",
        "content": (
            "To fix slow FCP: "
            "Inline critical CSS in the head. "
            "Load non-critical CSS asynchronously using media=print trick. "
            "Remove unused CSS rules. "
            "Use font-display: swap for web fonts. "
            "Minimize server response time with caching."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "TTFB Overview and Thresholds",
        "content": (
            "Time to First Byte (TTFB) measures how long the server takes "
            "to respond to a request. "
            "Good: under 800ms. Needs improvement: 800ms-1800ms. "
            "Poor: over 1800ms. Slow TTFB affects all other metrics downstream."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "TTFB Fix: Server Optimization",
        "content": (
            "To fix slow TTFB: "
            "Enable server-side caching (Redis, Memcached). "
            "Use a Content Delivery Network (CDN). "
            "Optimize database queries — add indexes. "
            "Enable HTTP/2 or HTTP/3. "
            "Use server-side rendering (SSR) instead of client-side rendering. "
            "Upgrade hosting plan if server is overloaded."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "Lighthouse Performance Score Breakdown",
        "content": (
            "Lighthouse performance score is calculated from: "
            "FCP (10%), SI (10%), LCP (25%), TBT (30%), CLS (25%). "
            "Score 90-100: Good. Score 50-89: Needs improvement. "
            "Score 0-49: Poor. "
            "Focus on LCP and TBT first for maximum score improvement. "
            "Each 100ms reduction in LCP improves score by approximately 1-2 points."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "Image Optimization for Web Performance",
        "content": (
            "Image optimization best practices: "
            "Use WebP format (25-35% smaller than JPEG). "
            "Use AVIF format (50% smaller than JPEG) for modern browsers. "
            "Implement lazy loading for below-fold images with loading='lazy'. "
            "Use responsive images with srcset and sizes attributes. "
            "Compress images to under 100KB where possible. "
            "Use image CDN for automatic format conversion and resizing."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "JavaScript Performance Optimization",
        "content": (
            "JavaScript optimization best practices: "
            "Code split large bundles using dynamic import(). "
            "Tree shake to remove dead code. "
            "Defer non-critical scripts with defer attribute. "
            "Load third-party scripts asynchronously. "
            "Use requestIdleCallback for non-urgent tasks. "
            "Avoid long synchronous operations over 50ms on main thread."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "CSS Performance Optimization",
        "content": (
            "CSS optimization best practices: "
            "Remove unused CSS rules (PurgeCSS or manual audit). "
            "Minify CSS files for production. "
            "Avoid @import in CSS (causes additional network requests). "
            "Use CSS containment for complex layouts. "
            "Inline critical above-the-fold CSS. "
            "Reduce CSS file size to under 50KB for critical path CSS."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "Korean E-commerce Performance Context",
        "content": (
            "Korean e-commerce sites like Decathlon Korea, Nike Korea, "
            "Adidas Korea target mobile users with LTE/5G connections. "
            "Korean users expect fast page loads under 3 seconds. "
            "Mobile performance is more important than desktop for Korean market. "
            "Korean product pages often have heavy image galleries causing slow LCP. "
            "Third-party Korean analytics and payment scripts cause high TBT."
        ),
        "doc_type": "context",
    },
]


def embed_cwv_guides(cursor, model):
    """Embed hardcoded CWV guides — run once only."""
    print("\n[Source 1] Embedding CWV guides...")
    inserted = 0
    skipped = 0

    for doc in CWV_GUIDES:
        embedding = embed_text(model, doc["content"])
        ok = insert_document(
            cursor=cursor,
            title=doc["title"],
            content=doc["content"],
            source=f"cwv_guide_{doc['title'].lower().replace(' ', '_').replace(':', '')}",
            doc_type=doc["doc_type"],
            embedding=embedding,
        )
        if ok:
            inserted += 1
            print(f"  ✅ {doc['title']}")
        else:
            skipped += 1
            print(f"  ⏭️  {doc['title']} (already exists)")

    print(f"  → inserted: {inserted} | skipped: {skipped}")
    return inserted


# ── Source 2: Lighthouse Opportunities ───────────────────────────────────────

def embed_opportunities(cursor, model):
    """
    Embed lighthouse_opportunities from DB.
    Uses average savings_ms across all runs.
     unique opportunities only.
    """
    print("\n[Source 2] Embedding lighthouse opportunities...")

    # FIX: average savings, 13 unique rows only
    cursor.execute("""
        SELECT
            opportunity_id,
            title,
            description,
            AVG(savings_ms)::int as avg_savings,
            severity,
            category,
            MIN(test_id) as test_id
        FROM lighthouse_opportunities
        GROUP BY opportunity_id, title, description,
                 severity, category
        ORDER BY avg_savings DESC
    """)
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} unique opportunities")

    inserted = 0
    skipped = 0

    for row in rows:
        (opportunity_id, title, description,
         avg_savings, severity, category, test_id) = row

        content = (
            f"Performance opportunity: {title}. "
            f"{description or ''} "
            f"Average estimated savings: {avg_savings}ms. "
            f"Severity: {severity}. "
            f"Category: {category}. "
            f"Fix this to improve {category} performance "
            f"and reduce page load time by {avg_savings}ms."
        )

        source = f"lighthouse_opportunity_{opportunity_id}"
        embedding = embed_text(model, content)

        ok = insert_document(
            cursor=cursor,
            title=f"Fix: {title}",
            content=content,
            source=source,
            doc_type="lighthouse_opportunity",
            embedding=embedding,
            metadata={
                "opportunity_id": opportunity_id,
                "test_id": test_id,
                "savings_ms": float(avg_savings) if avg_savings else None,
                "severity": severity,
                "category": category,
            }
        )
        if ok:
            inserted += 1
            print(f"  ✅ {title} (avg {avg_savings}ms)")
        else:
            skipped += 1
            print(f"  ⏭️  {title} (already exists)")

    print(f"  → inserted: {inserted} | skipped: {skipped}")
    return inserted


# ── Source 3: Competitor Benchmarks ──────────────────────────────────────────

def embed_competitor_benchmarks(cursor, model):
    """
    Generate and embed competitor benchmark comparisons.
    """
    print("\n[Source 3] Embedding competitor benchmarks...")

    cursor.execute("""
        SELECT url, page_type, device_type,
               lcp_ms, tbt_ms, cls_score,
               performance_score
        FROM lighthouse_runs
        WHERE site_type IN ('target', 'decathlon')
        ORDER BY created_at DESC
        LIMIT 10
    """)
    decathlon_rows = cursor.fetchall()

    cursor.execute("""
        SELECT url, page_type, device_type,
               competitor_name, lcp_ms, tbt_ms,
               cls_score, performance_score
        FROM lighthouse_runs
        WHERE site_type = 'competitor'
        ORDER BY created_at DESC
        LIMIT 10
    """)
    competitor_rows = cursor.fetchall()

    if not decathlon_rows or not competitor_rows:
        print("  ⚠️  Not enough data for benchmarks — skipping")
        return 0

    inserted = 0
    skipped = 0

    for dec in decathlon_rows:
        (dec_url, dec_page, dec_device,
         dec_lcp, dec_tbt, dec_cls,
         dec_score) = dec

        for comp in competitor_rows:
            (comp_url, comp_page, comp_device,
             comp_name, comp_lcp, comp_tbt,
             comp_cls, comp_score) = comp

            if dec_page != "main" or dec_device != comp_device:
                continue

            dec_lcp = float(dec_lcp or 0)
            comp_lcp = float(comp_lcp or 0)

            dec_tbt = float(dec_tbt or 0)
            comp_tbt = float(comp_tbt or 0)

            dec_score = float(dec_score or 0)
            comp_score = float(comp_score or 0)

            lcp_diff = dec_lcp - comp_lcp
            tbt_diff = dec_tbt - comp_tbt
            score_diff = dec_score - comp_score

            content = (
                f"Decathlon Korea {dec_page} page ({dec_device}) "
                f"vs {comp_name} Korea benchmark comparison. "
                f"Decathlon LCP: {dec_lcp}ms vs {comp_name} LCP: {comp_lcp}ms "
                f"(difference: {lcp_diff:.0f}ms). "
                f"Decathlon TBT: {dec_tbt}ms vs {comp_name} TBT: {comp_tbt}ms "
                f"(difference: {tbt_diff:.0f}ms). "
                f"Decathlon score: {dec_score} vs {comp_name} score: {comp_score} "
                f"(difference: {score_diff:.1f} points). "
                f"{'Decathlon is slower than competitor — improvement needed.' if lcp_diff > 0 else 'Decathlon is faster than competitor.'}"
            )

            title  = f"Benchmark: Decathlon vs {comp_name} {dec_page} {dec_device}"
            source = f"benchmark_decathlon_vs_{comp_name}_{dec_page}_{dec_device}"

            embedding = embed_text(model, content)
            ok = insert_document(
                cursor=cursor,
                title=title,
                content=content,
                source=source,
                doc_type="competitor_benchmark",
                embedding=embedding,
                metadata={
                    "decathlon_lcp":   dec_lcp,
                    "competitor_lcp":  comp_lcp,
                    "competitor_name": comp_name,
                    "page_type":       dec_page,
                    "device_type":     dec_device,
                }
            )
            if ok:
                inserted += 1
                print(f"  ✅ {title}")
            else:
                skipped += 1

    print(f"  → inserted: {inserted} | skipped: {skipped}")
    return inserted


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("RAG KNOWLEDGE BASE — EMBED PIPELINE")
    print("=" * 55)

    model = load_model()

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        total = 0

        # Source 1: CWV guides (one-time)
        total += embed_cwv_guides(cursor, model)
        conn.commit()

        # Source 2: Lighthouse opportunities
        total += embed_opportunities(cursor, model)
        conn.commit()

        # Source 3: Competitor benchmarks
        total += embed_competitor_benchmarks(cursor, model)
        conn.commit()

        print(f"\n{'=' * 55}")
        print(f"✅ RAG Knowledge Base complete!")
        print(f"   Total new documents: {total}")

        cursor.execute("SELECT COUNT(*) FROM rag_documents")
        count = cursor.fetchone()[0]
        print(f"   Total in DB:         {count}")
        print("=" * 55)

    except Exception as e:
        print(f"❌ embed.py failed: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    main()