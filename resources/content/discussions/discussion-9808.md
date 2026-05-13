---
number: 9808
title: >-
  Architectural Brainstorm: Encoding Semantic Concepts into the Native Edge
  Graph
author: tobiu
category: Ideas
createdAt: '2026-04-09T08:18:50Z'
updatedAt: '2026-04-09T08:18:50Z'
---
## The Concept: Semantic Ontology Ingestion
Currently, the SQLite Native Edge Graph focuses primarily on physical/literal structure (e.g., mapping `CLASS` to `FILE` or `ISSUE`). However, Neo.mjs is heavily driven by abstract concepts—like "Application Engine", "Off the main thread", "Reactivity", and the "Agent SDK". 

While these concepts exist in our markdown guides (e.g., `learn/benefits/Introduction.md`) and are vectorized in ChromaDB for similarity searches, they are completely absent from the structural topology of the graph itself. 

We propose adding a **Semantic Ontology Ingestor** that extracts these concepts from markdown guides and structurally anchors them into the Native Graph.

## The Rationale
1. **Closing the "Codebase Gap" hallucination:** Once concepts are formal Nodes (e.g. `[Concept: Application Engine]`), our algorithms will understand that these are conceptual constructs, not missing `.js` files. This aligns perfectly with our recent strict Type-Aware filtering optimizations.
2. **True Hybrid RAG:** We can natively map `IMPLEMENTS` edges between physical classes (like `AppWorker`) and abstract concepts (like `Off the main thread`). This allows subagents to traverse the graph from a conceptual feature request directly down to the literal classes that implement that pattern, rather than relying solely on fuzzy vector similarity.

## Open Questions
- **Extraction Mechanism:** Should we use an LLM (Gemma4) pass during `sandman` digestion to extract concepts from new guides automatically, or maintain a deterministic, source-of-truth `concepts.json` dictionary?
- **Node Lifecycle:** How do we handle updating or deprecating concepts as the framework strategy evolves?
- **Relationship Typing:** What should the Edge taxonomy look like? Should we use `IMPLEMENTS`, `DESCRIBED_IN`, `RELATED_TO_CONCEPT`?
