"""
embed.py

Production-ready RAG Knowledge Base Builder for Luminara.

Purpose:
- Build/update rag_documents using BGE-M3 1024-dimensional embeddings.
- Support all performance problem types through:
  1. Core Web Vitals guides
  2. Page/device-aware Lighthouse opportunities
  3. Main-page competitor benchmark context

Production behavior:
- Incremental update using content_hash.
- Skips unchanged documents unless --force is used.
- Batch embedding for speed.
- Keeps listener fast: this script should be run by daily ETL/RAG update job, not by listener.py.
"""

import argparse
import hashlib
import json
import os
import re
from typing import Any, Dict, Iterable, List, Sequence
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json
from sentence_transformers import SentenceTransformer


load_dotenv()


# ─────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
EXPECTED_EMBEDDING_DIM = int(os.getenv("EXPECTED_EMBEDDING_DIM", "1024"))
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "16"))

TARGET_SITE_TYPES = tuple(
    item.strip()
    for item in os.getenv("RAG_TARGET_SITE_TYPES", "target,decathlon").split(",")
    if item.strip()
)


# ─────────────────────────────────────────────────────────────
# DB Connection
# ─────────────────────────────────────────────────────────────

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def get_lhci_connection():
    return psycopg2.connect(
        host=os.getenv("HOST_IP"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("LHCI_DB", "lhci"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def _url_to_page_type(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if not path:
        return "main"
    parts = [p for p in path.split("/") if p]
    return parts[0] if parts else "main"


# ─────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────

def load_model() -> SentenceTransformer:
    print(f"Loading embedding model: {EMBEDDING_MODEL_NAME}")
    model = SentenceTransformer(EMBEDDING_MODEL_NAME)

    dim = model.get_sentence_embedding_dimension()
    print(f"✅ Model loaded — dim: {dim}")

    if dim != EXPECTED_EMBEDDING_DIM:
        raise RuntimeError(
            f"Embedding dimension mismatch. "
            f"Model={EMBEDDING_MODEL_NAME} dim={dim}, "
            f"EXPECTED_EMBEDDING_DIM={EXPECTED_EMBEDDING_DIM}. "
            f"Your rag_documents.embedding column must match this dimension."
        )

    return model


def embed_texts(
    model: SentenceTransformer,
    texts: Sequence[str],
    batch_size: int = EMBED_BATCH_SIZE,
) -> List[List[float]]:
    if not texts:
        return []

    vectors = model.encode(
        list(texts),
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return [vector.tolist() for vector in vectors]


# ─────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────

def normalize_source_part(value: Any) -> str:
    text = str(value or "unknown").lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text or "unknown"


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def vector_literal(embedding: List[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in embedding) + "]"


def get_existing_hashes(cursor) -> Dict[str, str]:
    cursor.execute("""
        SELECT
            source,
            metadata ->> 'content_hash' AS content_hash
        FROM rag_documents
    """)

    return {
        source: hash_value
        for source, hash_value in cursor.fetchall()
        if source and hash_value
    }


def upsert_document(
    cursor,
    doc: Dict[str, Any],
    embedding: List[float],
) -> None:
    metadata = dict(doc.get("metadata") or {})
    metadata.update({
        "content_hash": doc["content_hash"],
        "embedding_model": EMBEDDING_MODEL_NAME,
        "embedding_dim": EXPECTED_EMBEDDING_DIM,
    })

    cursor.execute(
        """
        INSERT INTO rag_documents (
            title,
            content,
            embedding,
            source,
            doc_type,
            metadata,
            updated_at
        )
        VALUES (%s, %s, %s::vector, %s, %s, %s, NOW())
        ON CONFLICT (source)
        DO UPDATE SET
            title      = EXCLUDED.title,
            content    = EXCLUDED.content,
            embedding  = EXCLUDED.embedding,
            doc_type   = EXCLUDED.doc_type,
            metadata   = EXCLUDED.metadata,
            updated_at = NOW()
        """,
        (
            doc["title"],
            doc["content"],
            vector_literal(embedding),
            doc["source"],
            doc["doc_type"],
            Json(metadata),
        ),
    )


def prepare_changed_docs(
    docs: Iterable[Dict[str, Any]],
    existing_hashes: Dict[str, str],
    force: bool = False,
) -> List[Dict[str, Any]]:
    changed = []

    for doc in docs:
        doc = dict(doc)
        doc_hash = content_hash(doc["content"])
        doc["content_hash"] = doc_hash

        if not force and existing_hashes.get(doc["source"]) == doc_hash:
            continue

        changed.append(doc)

    return changed


def embed_and_upsert_docs(
    cursor,
    model: SentenceTransformer,
    docs: List[Dict[str, Any]],
    existing_hashes: Dict[str, str],
    force: bool = False,
    label: str = "documents",
) -> int:
    changed_docs = prepare_changed_docs(
        docs=docs,
        existing_hashes=existing_hashes,
        force=force,
    )

    skipped = len(docs) - len(changed_docs)

    print(f"  Total {label}: {len(docs)}")
    print(f"  Changed/new: {len(changed_docs)} | unchanged skipped: {skipped}")

    if not changed_docs:
        return 0

    embeddings = embed_texts(
        model=model,
        texts=[doc["content"] for doc in changed_docs],
        batch_size=EMBED_BATCH_SIZE,
    )

    for doc, embedding in zip(changed_docs, embeddings):
        upsert_document(cursor, doc, embedding)

    return len(changed_docs)


# ─────────────────────────────────────────────────────────────
# Source 1: Core Web Vitals Guides
# ─────────────────────────────────────────────────────────────

CWV_GUIDES = [
    {
        "title": "LCP Overview and Thresholds",
        "content": (
            "Largest Contentful Paint (LCP) measures how long it takes "
            "for the largest visible content element to load. "
            "Good: under 2500ms. Needs improvement: 2500-4000ms. "
            "Poor: over 4000ms. LCP is a key Core Web Vital for user experience "
            "and search quality."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "LCP Common Causes",
        "content": (
            "Common causes of slow LCP include large unoptimized hero images, "
            "late-discovered product gallery images, render-blocking JavaScript or CSS, "
            "slow server response time, and client-side rendering delaying visible content."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "LCP Fix: Prioritize Critical Images",
        "content": (
            "For LCP image issues, prioritize the first visible hero or product image. "
            "Use loading='eager' and fetchpriority='high' for the LCP image only. "
            "Use loading='lazy' for below-the-fold images. Use decoding='async'. "
            "Use responsive srcset/sizes and modern formats such as WebP or AVIF when safe. "
            "Avoid lazy loading the first visible LCP image."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "TBT Fix: Reduce JavaScript Execution",
        "content": (
            "For TBT and unused JavaScript issues, reduce JavaScript execution by code splitting, "
            "dynamic import, lazy loading heavy components, deferring non-critical scripts, "
            "removing unused imports, replacing heavy third-party scripts, and breaking long tasks "
            "into smaller asynchronous work. Do not change business logic while optimizing TBT."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "CLS Fix: Reserve Layout Space",
        "content": (
            "To reduce CLS, set width and height for images and videos, use aspect-ratio for "
            "responsive media, reserve space for banners, ads, embeds, and skeleton placeholders, "
            "avoid inserting content above existing content, and use transform animations instead "
            "of layout-triggering properties."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "FCP Fix: CSS and Font Optimization",
        "content": (
            "For FCP and render-blocking CSS issues, inline critical CSS, remove unused CSS, "
            "avoid CSS @import, defer non-critical stylesheets, use font-display: swap for fonts, "
            "and reduce critical CSS size."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "TTFB Fix: Server and Cache Optimization",
        "content": (
            "For TTFB issues, use CDN caching, server-side caching such as Redis or Memcached, "
            "database indexing, backend query optimization, HTTP/2 or HTTP/3, and improved server "
            "capacity. Automatic source-code patching should be conservative unless a safe config "
            "file such as next.config, middleware, or cache headers is available."
        ),
        "doc_type": "fix_guide",
    },
    {
        "title": "Lighthouse Performance Score Breakdown",
        "content": (
            "Lighthouse performance score is influenced by FCP, Speed Index, LCP, TBT, and CLS. "
            "LCP and TBT often have the largest practical impact for e-commerce pages. "
            "A staged remediation system should fix one high-confidence opportunity, rerun tests, "
            "then continue with the next ranked issue."
        ),
        "doc_type": "cwv_guide",
    },
    {
        "title": "Korean E-commerce Performance Context",
        "content": (
            "Korean e-commerce users expect fast mobile page loads on LTE and 5G networks. "
            "Product pages often have image galleries that affect LCP. Main pages often have "
            "hero banners and promotional widgets. Third-party analytics, payment, or marketing "
            "scripts may increase TBT. Fixes should be page-type aware."
        ),
        "doc_type": "context",
    },
]


def build_cwv_guide_docs() -> List[Dict[str, Any]]:
    docs = []

    for guide in CWV_GUIDES:
        source_title = normalize_source_part(guide["title"])
        docs.append({
            "title": guide["title"],
            "content": guide["content"],
            "source": f"cwv_guide_{source_title}",
            "doc_type": guide["doc_type"],
            "metadata": {
                "source_kind": "static_cwv_guide",
            },
        })

    return docs


# ─────────────────────────────────────────────────────────────
# Source 2: Page/device-aware Lighthouse Opportunities
# ─────────────────────────────────────────────────────────────

def build_opportunity_docs() -> List[Dict[str, Any]]:
    print("\n[Source 2] Collecting page/device-aware Lighthouse opportunities from lhci DB...")

    conn = get_lhci_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT url, lhr FROM runs ORDER BY "createdAt" DESC LIMIT 300'
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    # Aggregate: (page_type, device_type, audit_id) -> metrics
    aggregated: Dict[tuple, Dict] = {}

    for url, lhr_raw in rows:
        lhr = json.loads(lhr_raw) if isinstance(lhr_raw, str) else lhr_raw
        page_type = _url_to_page_type(url)
        cfg = lhr.get("configSettings", {})
        ff = cfg.get("formFactor") or cfg.get("emulatedFormFactor", "mobile")
        device_type = "mobile" if str(ff).lower() == "mobile" else "desktop"

        for audit_id, audit in lhr.get("audits", {}).items():
            details = audit.get("details") or {}
            if details.get("type") != "opportunity":
                continue
            savings = (
                details.get("overallSavingsMs")
                or audit.get("numericValue")
                or 0
            )
            if float(savings) <= 0:
                continue

            key = (page_type, device_type, audit_id)
            if key not in aggregated:
                aggregated[key] = {
                    "title": audit.get("title", audit_id),
                    "description": audit.get("description", ""),
                    "total_savings": 0.0,
                    "count": 0,
                    "score": audit.get("score"),
                }
            aggregated[key]["total_savings"] += float(savings)
            aggregated[key]["count"] += 1

    docs = []
    for (page_type, device_type, audit_id), data in aggregated.items():
        avg_savings = int(data["total_savings"] / data["count"])
        score = data.get("score")
        severity = (
            "high" if score is not None and score < 0.5
            else "low" if score is not None and score >= 0.9
            else "medium"
        )

        source = (
            "lighthouse_opportunity_"
            f"decathlon_"
            f"{normalize_source_part(page_type)}_"
            f"{normalize_source_part(device_type)}_"
            f"{normalize_source_part(audit_id)}"
        )

        content = (
            f"Performance opportunity on decathlon {page_type} page for {device_type}: {data['title']}. "
            f"{data['description'] or ''} "
            f"Average estimated savings: {avg_savings}ms. "
            f"Severity: {severity}. Category: performance. "
            f"Observed {data['count']} times in Lighthouse data. "
            f"This recommendation is page-aware and is most relevant to {page_type} pages on {device_type}. "
            f"Use it when the current audit group has page_type={page_type}, device_type={device_type}, "
            f"and a related opportunity such as {audit_id}."
        )

        docs.append({
            "title": f"Fix: {data['title']} ({page_type}/{device_type})",
            "content": content,
            "source": source,
            "doc_type": "lighthouse_opportunity",
            "metadata": {
                "source_kind": "lighthouse_opportunity",
                "opportunity_id": audit_id,
                "opportunity_key": audit_id,
                "site_type": "decathlon",
                "page_type": page_type,
                "device_type": device_type,
                "avg_savings_ms": avg_savings,
                "severity": severity,
                "category": "performance",
                "occurrence_count": data["count"],
            },
        })

    docs.sort(key=lambda d: d["metadata"]["avg_savings_ms"], reverse=True)
    print(f"  Found {len(docs)} page/device-aware opportunity docs")
    return docs


# ─────────────────────────────────────────────────────────────
# Source 3: Main-page Competitor Benchmarks
# ─────────────────────────────────────────────────────────────

def build_competitor_benchmark_docs(cursor) -> List[Dict[str, Any]]:
    print("\n[Source 3] Collecting main-page competitor benchmarks...")

    cursor.execute(
        """
        SELECT
            url,
            site_type,
            page_type,
            device_type,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            created_at
        FROM lighthouse_runs
        WHERE site_type = ANY(%s)
          AND page_type = 'main'
        ORDER BY created_at DESC
        LIMIT 30
        """,
        (list(TARGET_SITE_TYPES),),
    )
    decathlon_rows = cursor.fetchall()

    cursor.execute(
        """
        SELECT
            url,
            page_type,
            device_type,
            competitor_name,
            lcp_ms,
            tbt_ms,
            cls_score,
            performance_score,
            created_at
        FROM lighthouse_runs
        WHERE site_type = 'competitor'
          AND page_type = 'main'
        ORDER BY created_at DESC
        LIMIT 30
        """
    )
    competitor_rows = cursor.fetchall()

    if not decathlon_rows or not competitor_rows:
        print("  Not enough main-page benchmark data — skipping")
        return []

    docs = []
    seen_sources = set()

    for dec in decathlon_rows:
        (
            dec_url,
            dec_site_type,
            dec_page,
            dec_device,
            dec_lcp,
            dec_tbt,
            dec_cls,
            dec_score,
            dec_created_at,
        ) = dec

        for comp in competitor_rows:
            (
                comp_url,
                comp_page,
                comp_device,
                comp_name,
                comp_lcp,
                comp_tbt,
                comp_cls,
                comp_score,
                comp_created_at,
            ) = comp

            if dec_page != "main" or comp_page != "main":
                continue

            if dec_device != comp_device:
                continue

            safe_comp_name = normalize_source_part(comp_name)
            safe_device = normalize_source_part(dec_device)

            source = f"benchmark_main_decathlon_vs_{safe_comp_name}_{safe_device}"

            if source in seen_sources:
                continue

            seen_sources.add(source)

            dec_lcp_f = float(dec_lcp or 0)
            comp_lcp_f = float(comp_lcp or 0)

            dec_tbt_f = float(dec_tbt or 0)
            comp_tbt_f = float(comp_tbt or 0)

            dec_cls_f = float(dec_cls or 0)
            comp_cls_f = float(comp_cls or 0)

            dec_score_f = float(dec_score or 0)
            comp_score_f = float(comp_score or 0)

            lcp_diff = dec_lcp_f - comp_lcp_f
            tbt_diff = dec_tbt_f - comp_tbt_f
            cls_diff = dec_cls_f - comp_cls_f
            score_diff = dec_score_f - comp_score_f

            content = (
                f"Main page competitor benchmark for {dec_device}. "
                f"Decathlon Korea URL: {dec_url}. Competitor: {comp_name}, URL: {comp_url}. "
                f"Decathlon LCP {dec_lcp_f:.0f}ms vs {comp_name} LCP {comp_lcp_f:.0f}ms "
                f"(difference {lcp_diff:.0f}ms). "
                f"Decathlon TBT {dec_tbt_f:.0f}ms vs {comp_name} TBT {comp_tbt_f:.0f}ms "
                f"(difference {tbt_diff:.0f}ms). "
                f"Decathlon CLS {dec_cls_f:.4f} vs {comp_name} CLS {comp_cls_f:.4f} "
                f"(difference {cls_diff:.4f}). "
                f"Decathlon performance score {dec_score_f:.1f} vs {comp_name} score {comp_score_f:.1f} "
                f"(difference {score_diff:.1f}). "
                f"This benchmark is relevant only to main page {dec_device} recommendations. "
                f"{'Decathlon main page is slower than this competitor on LCP.' if lcp_diff > 0 else 'Decathlon main page is not slower than this competitor on LCP.'} "
                f"{'Decathlon main page has higher TBT than this competitor.' if tbt_diff > 0 else 'Decathlon main page does not have higher TBT than this competitor.'}"
            )

            docs.append({
                "title": f"Benchmark: Main Decathlon vs {comp_name} ({dec_device})",
                "content": content,
                "source": source,
                "doc_type": "competitor_benchmark",
                "metadata": {
                    "source_kind": "competitor_benchmark",
                    "site_type": dec_site_type,
                    "page_type": "main",
                    "device_type": dec_device,
                    "competitor_name": comp_name,
                    "decathlon_url": dec_url,
                    "competitor_url": comp_url,
                    "decathlon_lcp": dec_lcp_f,
                    "competitor_lcp": comp_lcp_f,
                    "lcp_diff": lcp_diff,
                    "decathlon_tbt": dec_tbt_f,
                    "competitor_tbt": comp_tbt_f,
                    "tbt_diff": tbt_diff,
                    "decathlon_cls": dec_cls_f,
                    "competitor_cls": comp_cls_f,
                    "cls_diff": cls_diff,
                    "decathlon_score": dec_score_f,
                    "competitor_score": comp_score_f,
                    "score_diff": score_diff,
                    "decathlon_created_at": str(dec_created_at),
                    "competitor_created_at": str(comp_created_at),
                },
            })

    print(f"  Found {len(docs)} main-page competitor benchmark docs")
    return docs


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def run_embed_pipeline(
    only: str = "all",
    force: bool = False,
) -> int:
    print("=" * 60)
    print("RAG KNOWLEDGE BASE — PRODUCTION EMBED PIPELINE")
    print("=" * 60)
    print(f"model: {EMBEDDING_MODEL_NAME}")
    print(f"expected_dim: {EXPECTED_EMBEDDING_DIM}")
    print(f"batch_size: {EMBED_BATCH_SIZE}")
    print(f"only: {only}")
    print(f"force: {force}")
    print("=" * 60)

    model = load_model()

    conn = None
    total_changed = 0

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        existing_hashes = get_existing_hashes(cursor)

        if only in {"all", "guides"}:
            print("\n[Source 1] Updating CWV guides...")
            docs = build_cwv_guide_docs()
            changed = embed_and_upsert_docs(
                cursor=cursor,
                model=model,
                docs=docs,
                existing_hashes=existing_hashes,
                force=force,
                label="CWV guides",
            )
            conn.commit()
            total_changed += changed
            existing_hashes = get_existing_hashes(cursor)
            print(f"  ✅ CWV guide docs updated: {changed}")

        if only in {"all", "opportunities"}:
            docs = build_opportunity_docs()
            changed = embed_and_upsert_docs(
                cursor=cursor,
                model=model,
                docs=docs,
                existing_hashes=existing_hashes,
                force=force,
                label="Lighthouse opportunity docs",
            )
            conn.commit()
            total_changed += changed
            existing_hashes = get_existing_hashes(cursor)
            print(f"  ✅ Opportunity docs updated: {changed}")

        if only in {"all", "benchmarks"}:
            docs = build_competitor_benchmark_docs(cursor)
            changed = embed_and_upsert_docs(
                cursor=cursor,
                model=model,
                docs=docs,
                existing_hashes=existing_hashes,
                force=force,
                label="competitor benchmark docs",
            )
            conn.commit()
            total_changed += changed
            existing_hashes = get_existing_hashes(cursor)
            print(f"  ✅ Benchmark docs updated: {changed}")

        cursor.execute("SELECT COUNT(*) FROM rag_documents")
        total_docs = cursor.fetchone()[0]

        print("\n" + "=" * 60)
        print("✅ RAG Knowledge Base update complete")
        print(f"Changed/new documents embedded: {total_changed}")
        print(f"Total rag_documents: {total_docs}")
        print("=" * 60)

        return total_changed

    except Exception as e:
        print(f"❌ embed.py failed: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Luminara production RAG embedding updater"
    )

    parser.add_argument(
        "--only",
        choices=["all", "guides", "opportunities", "benchmarks"],
        default="all",
        help="Select which document source to update.",
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-embedding even when content_hash did not change.",
    )

    args = parser.parse_args()

    run_embed_pipeline(
        only=args.only,
        force=args.force,
    )


if __name__ == "__main__":
    main()
