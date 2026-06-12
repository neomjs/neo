---
name: "Knowledge Base (Semantic RAG)"
tier: 2
uniqueToNeo: true
tags:
  - "agent-os"
  - "rag"
  - "vector-db"
verifiedAt: null
---

An MCP server backed by ChromaDB that provides semantic search over the entire indexed codebase (source, guides, examples, tickets, releases). It performs ETL from source to JSONL to vector embeddings, with class-hierarchy boosting.