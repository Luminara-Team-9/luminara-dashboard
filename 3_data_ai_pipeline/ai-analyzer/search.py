"""
search.py
RAG Similarity Search — test and utility module.
Searches rag_documents table using pgvector cosine similarity.

Usage:
    python search.py "How to fix slow LCP?"
    python search.py "unused javascript fix"
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()


def get_db_connection():
    """Connect to core_db."""
    return psycopg2.connect(
        host=os.getenv('HOST_IP'),
        port=os.getenv('PGPORT', '5432'),
        dbname=os.getenv('POSTGRES_DB'),
        user=os.getenv('POSTGRES_USER'),
        password=os.getenv('POSTGRES_PASSWORD')
    )


def load_model():
    """Load BGE-M3 embedding model."""
    print("Loading BGE-M3 model...")
    model = SentenceTransformer('BAAI/bge-m3')
    print("✅ BGE-M3 loaded")
    return model


def search(query, model, top_k=3):
    """
    Search rag_documents for most relevant docs.

    Args:
        query:  question or topic to search
        model:  BGE-M3 SentenceTransformer model
        top_k:  number of results to return (default 3)

    Returns:
        list of dicts with title, content, source,
        doc_type, similarity score
    """
    # convert query → vector
    query_vector = model.encode(
        query,
        normalize_embeddings=True
    ).tolist()

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # cosine similarity search
        # <=> = pgvector cosine distance operator
        # ORDER BY ASC = closest first
        cursor.execute("""
            SELECT
                title,
                content,
                source,
                doc_type,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_documents
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (
            str(query_vector),
            str(query_vector),
            top_k,
        ))

        rows = cursor.fetchall()

        results = []
        for row in rows:
            title, content, source, doc_type, similarity = row
            results.append({
                'title':      title,
                'content':    content,
                'source':     source,
                'doc_type':   doc_type,
                'similarity': round(float(similarity), 4),
            })

        return results

    finally:
        if conn:
            conn.close()


def format_for_agent(results):
    """
    Format search results for Qwen prompt injection.
    Returns clean text block ready for agent context.
    """
    if not results:
        return "No relevant documents found."

    formatted = []
    for i, doc in enumerate(results, 1):
        formatted.append(
            f"[Doc {i}] {doc['title']}\n"
            f"{doc['content']}"
        )

    return "\n\n".join(formatted)


def main():
    """Test search from command line."""
    if len(sys.argv) < 2:
        print("Usage: python search.py 'your query here'")
        print("Example: python search.py 'how to fix slow LCP'")
        sys.exit(1)

    query = " ".join(sys.argv[1:])

    print("=" * 55)
    print("RAG SIMILARITY SEARCH")
    print("=" * 55)
    print(f"Query: {query}")
    print()

    model = load_model()
    results = search(query, model, top_k=3)

    if not results:
        print("❌ No results found")
        print("→ Run embed.py first to populate rag_documents")
        return

    print(f"Top {len(results)} results:\n")
    for i, doc in enumerate(results, 1):
        print(f"─── Result {i} ───────────────────────")
        print(f"Title:      {doc['title']}")
        print(f"Type:       {doc['doc_type']}")
        print(f"Source:     {doc['source']}")
        print(f"Similarity: {doc['similarity']}")
        print(f"Content:    {doc['content'][:200]}...")
        print()

    print("=" * 55)
    print("Agent context format:")
    print("=" * 55)
    print(format_for_agent(results))


if __name__ == '__main__':
    main()