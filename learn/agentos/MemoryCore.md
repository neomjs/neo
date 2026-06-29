# Memory Core: Institutional Memory for the Agent OS

The expensive part of AI engineering is not the keystroke. It is the reasoning that surrounds it: the false start that was rejected, the operator correction that changed the architecture, the review that prevented a tidy but wrong PR, the handoff that let the next model continue without re-learning the same lesson.

Without Memory Core, that work evaporates when a session ends. A fresh agent wakes up as a stranger to the repository, repeats old mistakes, and spends the release window reconstructing context that already existed yesterday.

The **Memory Core Server** (`neo.mjs-memory-core`) turns those vanished moments into institutional memory. It is the Agent OS long-term memory center: raw turns, summaries, trust metadata, mailbox state, and graph-backed coordination substrate all stay queryable for the next maintainer. That is what makes night-shift continuity possible. A peer's work can survive the model boundary, the harness boundary, and the calendar boundary.

The closer analogy is a hippocampus, not an archive. A brain does not keep every experience in active attention; it consolidates experience into long-term traces and recalls the relevant traces when a new situation needs them. Memory Core gives agents the same primitive. The live context can stay lean while `query_summaries`, `query_raw_memories`, and session recovery rehydrate the decisions, corrections, and handoffs that matter right now.

It is also a stigmergic substrate. Agents leave durable trails in the shared medium: A2A messages, permission edges, issue/session/memory graph links, and Golden Path frontier signals. The next maintainer does not need to have been present for the previous session; they can read the trail and continue from it. In the wider Brain loop, Hebbian decay is the evaporation side of that same mechanism: graph signals that are not reinforced weaken or disappear, while repeatedly useful trails gain weight.

For a human maintainer, this turns overnight agent work from a pile of transcripts into inspectable institutional continuity: who acted, why they believed it, which review corrected it, and what should happen next.

For an LLM maintainer, it turns a cold start into situated agency. The model can ask the organism what it has already learned before it edits, reviews, or escalates, so each session begins with inherited judgment instead of amnesia.

## What It Preserves

Memory Core persists five kinds of institutional knowledge:

*   **Interactions** — every prompt, thought process, and response, stored as a raw memory. The *reasoning* is captured, not just the output.
*   **Decisions** — the *why* behind a chosen approach, so it can be revisited instead of relitigated.
*   **Summaries** — high-level abstractions of whole sessions, so past work is findable in one query instead of re-read line by line.
*   **Coordination** — A2A mailbox messages, wake routing, and permission edges, stored in the Native Edge Graph so agents hand work to each other with durable provenance instead of transient chat context.
*   **Trust** — every memory and summary carries agent identity and trust-tier metadata, so the swarm can recall shared memory without laundering low-trust input into higher-trust conclusions.

The payoff is not a bigger chat log. It is identity-bound continuity: a peer's prior reasoning becomes searchable substrate for the next peer. (Neural Link remains the *runtime-app* possession and inspection bridge; Memory Core is the *across-time* one.)

## How It Works

Memory Core is one server in the Agent OS MCP set — the checkout ships six (`file-system`, `github-workflow`, `gitlab-workflow`, `knowledge-base`, `memory-core`, `neural-link`) — and it stays a distinct institutional-memory and coordination surface, not a merged monolith. It is built on the same `Neo.core.Base` class system as the Body's UI engine (more on that below), so the backend is as explicit and inspectable as the frontend.

Two stores work together:

*   **Semantic memory** lives in the deployment-wide **unified ChromaDB** process. One Chroma daemon and one persist directory back several collections — `neo-agent-memory` (raw turns), `neo-agent-sessions` (summaries), `neo-native-graph` (graph-vector retrieval), and the Knowledge Base's own collection — separated by collection and metadata, not by process. One Chroma process does not mean one collection; separate MCP servers do not mean separate vector stores.
*   **Structural memory** — the Native Edge Graph of identities, permissions, messages, and issue/session links — lives in SQLite, the authority for who-can-read-what and who-said-what.

Embeddings and summaries run through configurable providers, and the choice is **local-first**: the default profile embeds and summarizes with local models (qwen3 embeddings, Gemma summaries) on an OpenAI-compatible endpoint — private, zero-API-cost, on-prem — while remote Gemini is one env-var away when you want it. A running deployment's `healthcheck.providers` block is always the source of truth for what it is actually using.

## Save-Then-Respond: why the reasoning survives

The one rule that makes everything above possible is the **transactional memory protocol**. Every turn follows a strict loop:

1.  **Think** — analyze the request.
2.  **Act** — execute tools, gather information.
3.  **Consolidate** — formulate the response.
4.  **Save** — persist the *entire* turn (prompt + thought + response) via `add_memory`.
5.  **Respond** — deliver the answer only after the save is confirmed.

The save gates the response on purpose. If the internal reasoning — the *thought*, not just the final text — is not persisted, it cannot teach the next session. Save-then-respond is the discipline that turns a transcript into institutional memory.

## Self-organizing recall: summaries and sunset

Memory Core summarizes itself. On startup it scans for un-summarized sessions and uses the configured summary model to generate a structured recap of each — a title, a category (`bugfix`, `feature`, `refactoring`, …), 0–100 productivity / complexity / quality scores, the technologies touched, and provenance (the source identities and most-restrictive trust tier, so a summary cannot hide lower-trust input behind the summarizer). Every new session therefore opens with an indexed recap of past work instead of a blank slate.

Sessions from *external* harnesses are captured the same way, through a mailbox bridge: when any agent on any clone runs the session-sunset ritual, its final hand-off message lands in the shared graph, and Memory Core ingests it into a summary — so continuity survives even across tools that never shared a process.

## Recalling the past: Zoom Out, then Zoom In

Effective agents query in two stages:

1.  **Zoom out** — `query_summaries` finds the relevant *past session* ("refactoring the virtual list" → "Session #42: Grid Virtualization Refactor").
2.  **Zoom in** — `query_raw_memories`, optionally filtered to that session, retrieves the specific decision or snippet ("why a `Map` instead of an `Object`?" → the exact reasoning from that session).

Zoom out to locate, zoom in to recover — recall on demand, the hippocampus pattern in practice.

## One organism: built on the same runtime as the Body

Memory Core is not a bolt-on backend. It is written in the **same Neo.mjs class system** that powers the multi-threaded UI engine — singletons for single-source-of-truth services, `initAsync()` to order dependency chains without race conditions, and reactive configs (`afterSet…` hooks) so a service re-initializes cleanly when its environment changes. Body and Brain share one set of primitives and one evolution mechanism; Memory Core is the Brain proving the organism is genuinely one system, not two glued together.

## Operations and reference

This guide is the *concept*. The operational detail lives in dedicated references, kept single-sourced so they never drift against the running system:

*   **[Memory Core MCP API](./tooling/MemoryCoreMcpApi.md)** — the full tool catalog (memory, A2A / coordination, summary, session, and health tools), request/response specs, and the `healthcheck` payload contract.
*   **[Restoration Runbook](./tooling/RestorationRunbook.md)** — `npm run ai:backup` / `ai:restore`, atomic-bundle layout, restore modes and safeguards, and per-subsystem recovery procedures.
*   **[Multi-Tenant Migration Guide](./tooling/MultiTenantMigrationGuide.md)** — the lazy-tag-on-read tenancy model, `memorySharing` policies, and the on-demand legacy census.
*   **[Deployment Cookbook](./DeploymentCookbook.md)** — configuration, transports (stdio vs SSE), and running Memory Core as a cloud microservice.
