---
number: 9810
title: 'Architecture: Defining [CONCEPT] Nodes in the Native Edge Graph'
author: tobiu
category: Ideas
createdAt: '2026-04-09T08:41:28Z'
updatedAt: '2026-04-09T08:47:24Z'
---
# The Concept Node Architecture (Ideation Sandbox)

## The Concept
Currently, our Native Edge Graph maps physical entities like `[CLASS]`, `[METHOD]`, and `[DISCUSSION]`. However, Neo.mjs is deeply driven by abstract architectural principles (e.g., *The Application Engine*, *Reactivity*, *Off the Main Thread*, *Asymmetric VDOM*). 
Because these are concepts and not physical implementation classes, the GraphRAG pipeline recently mathematically flagged "Core Config System" as a `[DOC_GAP]` despite it existing conceptually. We temporarily filtered abstract nodes (#9807), but the strategic goal must be to grant the Memory Core "Deep Framework Intuition."

We propose introducing a new `[CONCEPT]` node schema to the SQLite Native Edge Graph.

## The Rationale
- **Semantic Anchoring:** By mapping concepts (like "Off the Main Thread"), we can draw directed edges `(CONCEPT)-[:IMPLEMENTS]->(CLASS)` connecting abstract framework documentation directly to the underlying engine logic.
- **Improved Gap Inference:** The pipeline will no longer mistake concepts for missing codebase implementations.
- **Enhanced Agent Intuition:** Future agents can traverse from a UI component -> its class -> the concept it relies on (e.g. Asymmetric VDOM), preventing harmful, highly naive implementation approaches (like an LLM proposing synchronous DOM manipulation).

## Proposed Schema
A conceptual `[CONCEPT]` node could be defined by:
- **`id`**: e.g., `concept:asymmetric-vdom`
- **`source`**: The Markdown guide parsing it (e.g., `learn/benefits/JSONFirstUIs.md`).
- **`edges`**: Derived from Markdown frontmatter or an explicit conceptual map, pointing to critical classes like `Neo.vdom.Helper`.

## Open Questions
1. **Source of Truth:** Should `[CONCEPT]` nodes be inferred dynamically via LLM extraction during `.md` ingestion, or strictly defined via YAML frontmatter inside our `learn/` guides?
2. **Deterministic Edge Generation:** How do we map `[CONCEPT]` -> `[CLASS]` links without hallucination? Perhaps a structured `Dependencies` mapping block at the end of concept documentation?
3. **Synthesis Impact:** How does the Sandman/REM pipeline surface `[CONCEPT]` gaps in the `sandman_handoff.md` without overwhelming the physical codebase priorities?

Thoughts?

## Comments

### `@tobiu` commented on 2026-04-09T08:47:24Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Closing this as a duplicate of #9808.
> 
> (The agent session context flipped, causing me to redundantly propose the exact same ingestion strategy twice!)

---

