# Knowledge Base Enhancement Strategy (Anchor & Echo)

> How to write source documentation so a cold reader — a human, or a fresh / **amnesiac** AI session — lands on the file's most relevant *intent* on first read, AND so `ask_knowledge_base` / `query_documents` semantic search actually returns it. The commit-time gate is `AGENTS.md` §pre_commit_gates **Gate 2**; this guide is the *why* and the worked example behind that gate. The trigger-shaped skeleton lives at `AGENTS_ATLAS.md` §15.2.

## Why it exists — two rationales (both easy to forget)

**1. The amnesiac-first-read.** A cold reader opening a file for the first time — a new human contributor, or (far more often in Neo) a fresh AI session with no prior context — must land on the file's load-bearing *intent* immediately, not reconstruct it from the mechanics. The class-level JSDoc is the first thing read; it carries the *why* and the invariants, not a restatement of the *what*. **Write for the reader who has no memory of this file** — that reader is the common case, not the exception.

**2. Chroma semantic-retrieval quality.** The docs ARE the embedded corpus. `ask_knowledge_base` / `query_documents` retrieve by *vector similarity* over the doc text (see `KnowledgeBase.md` for the RAG / ChromaDB engine). Dense, intent-anchored **vocabulary** produces better embeddings → better matches. A class whose JSDoc names the concepts it embodies, in domain vocabulary reused consistently, is findable by a semantic query for those concepts; a class with thin "sets the value" docs is invisible to it. **Retrieval quality is a direct function of the doc vocabulary** — this is the mechanism the bare "add JSDoc" checkbox loses.

## The mechanics — Anchor, then Echo

- **Anchor** — at the class level and major overrides, establish the high-value vocabulary: the concepts the class embodies, the load-bearing invariants, the *why* of non-obvious choices, and any "do not do X without measuring Y" change-guards. This is the term-anchor the rest of the file — and the embedder — keys on.
- **Echo** — reuse the anchored terms in the isolated fields and helper methods. A `@member` doc that echoes the class-level vocabulary keeps the concept retrievable at member granularity and reinforces the embedding.
- **Tag** — `@summary` (one-line intent), `@see` (a *stable* related symbol / ADR / guide — never a line number), `@protected` / `@private` (the contract surface).

## Worked example — `src/core/Base.mjs` (the bar)

**The class JSDoc carries the *why* + a change-guard, not just the *what*:**
> *"`className` and `ntype` intentionally live on instances as well as on static class config. This costs a few prototype slots, but it keeps Chrome DevTools and Neural Link inspection direct... That ergonomics choice is part of the core debugging contract; **do not demote these values to static-only metadata without measuring the runtime/debugging trade-off** and updating every consumer that serializes, routes, or instantiates by class identity."*

A cold reader learns the invariant, its rationale, and the change-guard in three sentences — and a semantic query for "instance className debugging contract" retrieves exactly this class.

**The `undefined` sentinel — the *why* is taught where the concept lives:**
> *"In Neo.mjs, `undefined` is used as a strict, immutable sentinel value representing 'initial instantiation'... you should never set a config to `undefined` later in its lifecycle. If you need to clear or reset a config's state, explicitly set it to `null`."*

The reactive-vs-prototype config distinction, the `beforeGet` / `beforeSet` / `afterSet` lifecycle hooks, and the sentinel are documented at the point of definition, in reused vocabulary — that is the Echo, and it is why an agent can `ask` "how do reactive configs signal first instantiation" and land here.

## The virtuous cycle

Better intent-docs → better embeddings → better `ask` / `query` retrieval → the next agent finds the right prior art → builds on it instead of re-deriving or duplicating → documents the new work to the same bar. The discipline **compounds**: every well-anchored file makes the corpus more findable. Thin docs break the cycle — the work exists but is unretrievable, so it gets re-derived (the failure mode this strategy prevents).

## Where this lives

- **Commit gate:** `AGENTS.md` §pre_commit_gates Gate 2 — new/modified classes and methods need JSDoc / `@summary` (this guide is the *why* behind that gate).
- **Trigger skeleton:** `AGENTS_ATLAS.md` §15.2 (Anchor → Echo → tags), §15.6 (source-comment intent filter: durable intent, not ticket / line-number archaeology), §15.7 (virtuous cycle).
- **The system it feeds:** `KnowledgeBase.md` (the RAG / ChromaDB engine + the `ask` / `query` tools).
- **The bar:** `src/core/Base.mjs`.
