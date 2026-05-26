"""
search.py

RAG Similarity Search — manual test/debug utility.

This file is NOT part of the main production runtime.
Production runtime uses:
    agent.py -> rag_service.py /search -> rag_documents

Use this file when you want to manually check whether RAG retrieval works.

Usage:
    python search.py "How to fix slow LCP?"
    python search.py "unused javascript fix" --top-k 5
    python search.py "LCP product mobile" --page-type product --device-type mobile
"""

import argparse
from typing import Any, Dict, List, Optional

from embed import (
    get_db_connection,
    load_model,
    embed_texts,
    vector_literal,
)


def search(
    query: str,
    model,
    top_k: int = 3,
    doc_type: Optional[str] = None,
    page_type: Optional[str] = None,
    device_type: Optional[str] = None,
    source_kind: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search rag_documents using pgvector cosine similarity.

    Optional filters:
    - doc_type
    - page_type
    - device_type
    - source_kind
    """
    query_embedding = embed_texts(model, [query])[0]
    query_vector = vector_literal(query_embedding)

    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        where_clauses = []
        params: List[Any] = []

        if doc_type:
            where_clauses.append("doc_type = %s")
            params.append(doc_type)

        if page_type:
            where_clauses.append("metadata ->> 'page_type' = %s")
            params.append(page_type)

        if device_type:
            where_clauses.append("metadata ->> 'device_type' = %s")
            params.append(device_type)

        if source_kind:
            where_clauses.append("metadata ->> 'source_kind' = %s")
            params.append(source_kind)

        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        sql = f"""
            SELECT
                id,
                title,
                content,
                source,
                doc_type,
                metadata,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_documents
            {where_sql}
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """

        final_params = [query_vector] + params + [query_vector, top_k]

        cursor.execute(sql, final_params)

        rows = cursor.fetchall()

        results = []

        for row in rows:
            doc_id, title, content, source, doc_type, metadata, similarity = row

            results.append({
                "id": doc_id,
                "title": title,
                "content": content,
                "source": source,
                "doc_type": doc_type,
                "metadata": metadata,
                "similarity": round(float(similarity), 4),
            })

        return results

    finally:
        if conn:
            conn.close()


def format_for_agent(results: List[Dict[str, Any]]) -> str:
    """
    Format search results for Qwen prompt/debug view.
    """
    if not results:
        return "No relevant documents found."

    formatted = []

    for i, doc in enumerate(results, 1):
        formatted.append(
            f"[Doc {i}] {doc['title']}\n"
            f"Type: {doc['doc_type']}\n"
            f"Source: {doc['source']}\n"
            f"Similarity: {doc['similarity']}\n"
            f"{doc['content']}"
        )

    return "\n\n".join(formatted)


def main():
    parser = argparse.ArgumentParser(
        description="Manual RAG similarity search utility"
    )

    parser.add_argument(
        "query",
        nargs="+",
        help="Search query text",
    )

    parser.add_argument(
        "--top-k",
        type=int,
        default=3,
        help="Number of results to return",
    )

    parser.add_argument(
        "--doc-type",
        default=None,
        help="Optional doc_type filter, e.g. fix_guide or lighthouse_opportunity",
    )

    parser.add_argument(
        "--page-type",
        default=None,
        help="Optional metadata page_type filter, e.g. product or main",
    )

    parser.add_argument(
        "--device-type",
        default=None,
        help="Optional metadata device_type filter, e.g. mobile or desktop",
    )

    parser.add_argument(
        "--source-kind",
        default=None,
        help="Optional metadata source_kind filter",
    )

    args = parser.parse_args()

    query = " ".join(args.query)

    print("=" * 60)
    print("RAG SIMILARITY SEARCH")
    print("=" * 60)
    print(f"Query: {query}")
    print(f"top_k: {args.top_k}")
    print(f"doc_type: {args.doc_type}")
    print(f"page_type: {args.page_type}")
    print(f"device_type: {args.device_type}")
    print(f"source_kind: {args.source_kind}")
    print("=" * 60)

    model = load_model()

    results = search(
        query=query,
        model=model,
        top_k=args.top_k,
        doc_type=args.doc_type,
        page_type=args.page_type,
        device_type=args.device_type,
        source_kind=args.source_kind,
    )

    if not results:
        print("❌ No results found")
        print("→ Run embed.py first to populate rag_documents")
        return

    print(f"\nTop {len(results)} results:\n")

    for i, doc in enumerate(results, 1):
        metadata = doc.get("metadata") or {}

        print(f"─── Result {i} ───────────────────────")
        print(f"Title:      {doc['title']}")
        print(f"Type:       {doc['doc_type']}")
        print(f"Source:     {doc['source']}")
        print(f"Similarity: {doc['similarity']}")
        print(f"Page:       {metadata.get('page_type')}")
        print(f"Device:     {metadata.get('device_type')}")
        print(f"Kind:       {metadata.get('source_kind')}")
        print(f"Content:    {doc['content'][:300]}...")
        print()

    print("=" * 60)
    print("Agent context format:")
    print("=" * 60)
    print(format_for_agent(results))


if __name__ == "__main__":
    main()