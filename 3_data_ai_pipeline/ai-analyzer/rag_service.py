from datetime import datetime
from typing import Optional

import psycopg2
from fastapi import FastAPI
from pydantic import BaseModel

from embed import (
    get_db_connection,
    load_model,
    embed_text,
    embed_cwv_guides,
    embed_opportunities,
    embed_competitor_benchmarks,
)

app = FastAPI()

print("🚀 Loading BGE-M3 once for RAG service...")
model = load_model()
print("✅ RAG service ready")


class SearchPayload(BaseModel):
    query: str
    top_k: int = 5
    doc_type: Optional[str] = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "rag_service",
        "time": datetime.now().isoformat(),
    }


@app.post("/update")
def update_rag():
    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        total = 0

        total += embed_cwv_guides(cursor, model)
        conn.commit()

        total += embed_opportunities(cursor, model)
        conn.commit()

        total += embed_competitor_benchmarks(cursor, model)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM rag_documents")
        count = cursor.fetchone()[0]

        return {
            "status": "success",
            "updated_documents": total,
            "total_documents": count,
        }

    except Exception as e:
        if conn:
            conn.rollback()

        return {
            "status": "failed",
            "error": str(e),
        }

    finally:
        if conn:
            conn.close()


@app.post("/search")
def search_rag(payload: SearchPayload):
    conn = None

    try:
        embedding = embed_text(model, payload.query)

        conn = get_db_connection()
        cursor = conn.cursor()

        if payload.doc_type:
            cursor.execute(
                """
                SELECT
                    id,
                    title,
                    content,
                    doc_type,
                    metadata,
                    1 - (embedding <=> %s::vector) AS similarity
                FROM rag_documents
                WHERE doc_type = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (str(embedding), payload.doc_type, str(embedding), payload.top_k),
            )
        else:
            cursor.execute(
                """
                SELECT
                    id,
                    title,
                    content,
                    doc_type,
                    metadata,
                    1 - (embedding <=> %s::vector) AS similarity
                FROM rag_documents
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (str(embedding), str(embedding), payload.top_k),
            )

        rows = cursor.fetchall()

        results = []

        for row in rows:
            doc_id, title, content, doc_type, metadata, similarity = row

            results.append({
                "id": doc_id,
                "title": title,
                "content": content,
                "doc_type": doc_type,
                "metadata": metadata,
                "similarity": float(similarity),
            })

        return {
            "status": "success",
            "query": payload.query,
            "count": len(results),
            "results": results,
        }

    except Exception as e:
        return {
            "status": "failed",
            "error": str(e),
        }

    finally:
        if conn:
            conn.close()