---
number: 16586
title: >-
  The Knowledge Base has no WAL and no single embedding drainer; Memory Core has
  both
author: neo-opus-vega
category: Ideas
createdAt: '2026-08-06T09:52:52Z'
updatedAt: '2026-08-06T12:23:33Z'
closed: false
closedAt: null
routingDispositionSchemaVersion: discussion-routing-disposition.v1
routingDisposition: undetermined
routingDispositionReason: no-authoritative-lifecycle-marker
routingDispositionEvidence: []
contentTrust:
  projected: true
  quarantined: 0
  signals: []
conversationCompletenessSchemaVersion: discussion-conversation-completeness.v1
conversationComplete: true
conversationCommentCountObserved: 1
conversationCommentCountTotal: 1
conversationReplyCountObserved: 0
conversationReplyCountTotal: 0
---
> **PARKED ON PURPOSE.** Operator direction, 2026-08-06: the critical path is multi-tenant ingestion stability — first in our deployment, then in the client deployment. This Discussion exists so the parity gap is not re-derived from scratch in a later session. **Do not open a divergence cycle or graduate anything until the ingestion lane is stable.**
>
> **Revalidation trigger:** the tenant-repo-sync lane reports `completed` with a committed checkpoint on both configured repos, in both deployments.

## The gap, stated plainly

Memory Core and the Knowledge Base solve the same problem — get text embedded into Chroma — with two different architectures. Only one of them is safe for an MCP caller.

| | Memory Core | Knowledge Base |
|---|---|---|
| write path | `add_memory` appends to a JSONL write-ahead log | direct call into the ingestion service |
| who embeds | `embedDaemon` **only** — continuous task, singleton PID lock, retry/backoff, marker reconciliation, purge-race compensation, segment pruning | whichever process happened to call |
| concurrent embedders | one, by construction | **two** — kb-server (MCP dispatch) and the orchestrator (`tenant-repo-sync`, `kbSync`) |
| MCP call latency | bounded: append and return | unbounded: the caller waits for embedding |
| crash mid-work | WAL is the durable truth; next pass resumes | partial state, no resume ledger |
| overload guard | backlog grows, drain catches up | a **refusal** — `mcpSyncMaxChunks`, default 50 |

`ai/daemons/embed/daemon.mjs` describes itself as "the daemon half of the never-fail `add_memory` design". The Knowledge Base has no such half.

## Why the two diverged — the history worth keeping

Both started as **local STDIO MCP servers**: boot, summarize sessions, update the KB. As the agent team grew we added the Orchestrator and its daemons, and Memory Core matured first — it carries the heavy chat/embedding-model work, so it needed the WAL drainer earlier and got it.

The forcing constraint is not elegance: **MCP tool calls must return fast and non-blocking, or they time out.** The WAL exists because `add_memory` sits on the agent turn path and may never fail or stall. KB ingestion never had that pressure applied, so it embeds inline and defends itself with a volume gate instead — a refusal where MC has a queue.

Then came the cloud dockerized deployment, and the realization that debugging it required the same dockerized setup locally. That migration is mostly done. Ingestion stability is the current front.

So the asymmetry is **historical accretion, not a decision** — which is exactly why it is worth an explicit decision now rather than another year of drift.

## What the gate actually costs today

The volume gate is a symptom marker, not a solution. Observed on the live lane: `mcpSyncMaxChunks` defaults to 50; a tenant repo with 24,590 chunks cannot be ingested through any MCP-dispatched path at all. The code already anticipates this in its own refusal message — *"a tenant-scoped bulk ingestion facade is planned (Phase 2C)"* (`ingestSourceFilesTool.mjs`). **No ticket or Discussion for Phase 2C exists** (swept 2026-08-06). This Discussion is the placeholder that admission implies.

## Options, with falsifiers

Recorded to seed a later cycle, **not** to select now.

**A — KB gets its own WAL + drainer, mirroring MC.** Ingest appends; a container-plane daemon drains and embeds; MCP returns immediately.
*Falsifier:* if KB ingestion is overwhelmingly bulk/batch rather than turn-path, the never-fail latency property MC needs may not justify a second daemon and its liveness watchdog.

**B — One shared embedding drainer for both corpora.** A single writer to Chroma, per-corpus queues.
*Falsifier:* if MC's turn-path latency budget and KB's bulk throughput profile are genuinely incompatible, sharing a drainer couples them and the tighter budget loses — head-of-line blocking behind a 24k-chunk repo.

**C — Keep inline, fix the gate.** Raise/parameterize `mcpSyncMaxChunks`, add cooperative yielding, leave the architecture alone.
*Falsifier:* does not address concurrent writers, gives no crash resume, and the refusal-vs-queue distinction stays — a large tenant repo remains un-ingestable via MCP. Also the cheapest, so it must be argued against honestly rather than dismissed.

**D — Route bulk through the orchestrator only; MCP push stays small-batch.** Arguably the de-facto shape today; make it explicit and enforce it.
*Falsifier:* if agents legitimately need to push large batches manually, this codifies a limitation rather than removing it.

## What is already true and must not be re-derived

- `ingest_source_files` is **upsert-only** — it passes `deleteStale: false`, so it cannot delete. Its risk is latency, not destruction.
- The destructive default lives on a different path and is filed separately as #16584. **That is the urgent one; this is not.**
- `kbSync` and `tenant-repo-sync` are both container-plane per ADR-0014, so orchestrator-side embedding already has an authority home. Option A would extend that, not fight it.

## Open questions for the eventual cycle

1. Is KB ingestion ever on a latency-critical turn path, or always bulk? This decides A vs C more than anything else.
2. Do two concurrent embedders into one Chroma collection cause real interference, or only theoretical? Needs measurement, not argument.
3. Does the durability property MC gets from its WAL (crash mid-embed resumes) matter for KB, where the source is a re-readable Git mirror rather than an unrepeatable agent turn? **This is the strongest argument that the two are legitimately different** and should be attacked first.
4. Does ADR-0003/0017's unified-store decision already imply a unified write path, or deliberately leave it open?

## Scope

Deferred. No signal requested, no divergence cycle open, no graduation. Reopen at the revalidation trigger above.

Related: #16584 (the urgent destructive-default defect, independent) · #16585 (contract parity guard, same session) · #16566 / #16577 (the ingestion lane that surfaced all of this) · D#11676 (keeping MC lightweight ops alive during heavy Chroma work — adjacent, MC-side)

Origin Session ID: 6004a4aa-2089-4b14-b73f-b58c08cf53d9

Retrieval Hint: `query_raw_memories("KB WAL drainer parity with Memory Core embed daemon")` · `ai/daemons/embed/daemon.mjs` · "Phase 2C bulk ingestion facade"

Authored by @neo-opus-vega (Claude Opus 5).

## Comments

### `@neo-opus-vega` commented on 2026-08-06T12:23:33Z

## Adjacent, deliberately NOT the same lane

**A neighbouring lane opened on D#15605:** https://github.com/neomjs/neo/discussions/15605#discussioncomment-17920634

That lane is about **what gets ingested and how it is acquired** — sources/parsers as a declarable per-tenant surface, and whether acquisition must materialize the declared surface. This Discussion is about **durability and concurrency of the write path** — WAL, single drainer, MCP call latency.

They touch the same code and answer different questions, so a peer arriving from either should not assume the other is a duplicate. Two shared facts worth carrying between them:

- The two-concurrent-embedders concern in the table above now has a live specimen: `kbSync` and `tenant-repo-sync` deleted each other's rows on 2026-08-06 because they share a stamp. That is an *identity* collision, not a durability one — evidence for open question 2 here (do two embedders actually interfere), and it turned out to be yes, via stale-deletion rather than via write contention.
- The parked revalidation trigger on this Discussion (both repos `completed` with committed checkpoints) is closer than it was: #16587 and #16584 are merged, and the checkpoint has never yet committed even once.

Still parked per operator direction. No signal requested.

Authored by @neo-opus-vega (Claude Opus 5).

---

