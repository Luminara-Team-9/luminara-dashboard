"""
rag_service.py

Production-ready RAG search/update service for Luminara.

Purpose:
- Keep BGE-M3 loaded once.
- Search rag_documents using pgvector cosine distance.
- Optionally update RAG knowledge base through production embed.py pipeline.

Important:
- /search is used by agent.py during Fix Plan generation.
- /update should be used manually or by scheduled ETL/RAG job.
- listener.py should NOT call /update during PR trigger.
"""

from datetime import datetime
from typing import Optional, Any, Dict, List

from fastapi import FastAPI
from pydantic import BaseModel, Field

from embed import (
    get_db_connection,
    load_model,
    embed_texts,
    vector_literal,
    run_embed_pipeline,
)


app = FastAPI(
    title="Luminara RAG Service",
    description="Searches and updates RAG knowledge base for remediation agent.",
    version="2.0.0",
)


print("🚀 Loading BGE-M3 once for RAG service...")
model = load_model()
print("✅ RAG service ready")


class SearchPayload(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)

    # Optional filters
    doc_type: Optional[str] = None
    page_type: Optional[str] = None
    device_type: Optional[str] = None
    source_kind: Optional[str] = None


class UpdatePayload(BaseModel):
    only: str = Field(default="all", pattern="^(all|guides|opportunities|benchmarks)$")
    force: bool = False


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "rag_service",
        "time": datetime.now().isoformat(),
        "embedding_model_loaded": True,
    }


@app.post("/update")
def update_rag(payload: UpdatePayload = UpdatePayload()):
    """
    Update RAG documents using production embed.py pipeline.

    Recommended usage:
    - Run manually after ETL.
    - Or call from scheduled daily pipeline.
    - Do not call from listener.py during PR trigger.
    """
    try:
        changed = run_embed_pipeline(
            only=payload.only,
            force=payload.force,
        )

        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM rag_documents")
            total_documents = cur.fetchone()[0]
        finally:
            conn.close()

        return {
            "status": "success",
            "updated_documents": changed,
            "total_documents": total_documents,
            "only": payload.only,
            "force": payload.force,
        }

    except Exception as e:
        return {
            "status": "failed",
            "error": str(e),
            "only": payload.only,
            "force": payload.force,
        }


@app.post("/search")
def search_rag(payload: SearchPayload):
    """
    Search RAG documents using vector similarity.

    Supports optional metadata filters:
    - doc_type
    - page_type
    - device_type
    - source_kind

    If no filters are given, searches all documents.
    """
    conn = None

    try:
        query_embedding = embed_texts(model, [payload.query])[0]
        query_vector = vector_literal(query_embedding)

        conn = get_db_connection()
        cursor = conn.cursor()

        where_clauses = []
        params: List[Any] = []

        if payload.doc_type:
            where_clauses.append("doc_type = %s")
            params.append(payload.doc_type)

        if payload.page_type:
            where_clauses.append("metadata ->> 'page_type' = %s")
            params.append(payload.page_type)

        if payload.device_type:
            where_clauses.append("metadata ->> 'device_type' = %s")
            params.append(payload.device_type)

        if payload.source_kind:
            where_clauses.append("metadata ->> 'source_kind' = %s")
            params.append(payload.source_kind)

        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        sql = f"""
            SELECT
                id,
                title,
                content,
                doc_type,
                metadata,
                source,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_documents
            {where_sql}
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """

        final_params = [query_vector] + params + [query_vector, payload.top_k]

        cursor.execute(sql, final_params)
        rows = cursor.fetchall()

        results = []

        for row in rows:
            doc_id, title, content, doc_type, metadata, source, similarity = row

            results.append({
                "id": doc_id,
                "title": title,
                "content": content,
                "doc_type": doc_type,
                "metadata": metadata,
                "source": source,
                "similarity": float(similarity),
            })

        return {
            "status": "success",
            "query": payload.query,
            "count": len(results),
            "filters": {
                "doc_type": payload.doc_type,
                "page_type": payload.page_type,
                "device_type": payload.device_type,
                "source_kind": payload.source_kind,
            },
            "results": results,
        }

    except Exception as e:
        return {
            "status": "failed",
            "query": payload.query,
            "error": str(e),
        }

    finally:
        if conn:
            conn.close()