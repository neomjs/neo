---
id: 9999
title: '[Epic] Cloud-Native Knowledge & Multi-Tenant Memory Core'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-14T15:09:09Z'
updatedAt: '2026-04-21T17:27:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9999'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 10013 [Sub-Epic] DreamService Decomposition'
  - '[ ] 10015 [Sub-Epic] Dynamic Topology — Unified vs. Federated Routing'
  - '[ ] 10016 [Sub-Epic] Multi-Tenant Identity & Data Privacy'
  - '[ ] 10030 [Epic] Concept Ontology & Semantic Gap Inference'
  - '[x] 10057 Knowledge Base: Add PullRequestSource for PR Conversation Embeddings'
  - '[ ] 10127 HealthService: surface effective unified/federated topology in /health'
  - '[x] 10129 Backup: atomic timestamped bundle across all persistent subsystems'
  - '[ ] 10136 Rewrite CodebaseOverview.md to reflect Two Hemispheres architecture + Dream Pipeline'
  - '[ ] 10139 Extend Memory Core with Explicit A2A Primitive'
  - '[ ] 10143 Graph-first Memory artifacts: lift Memory + Session to first-class nodes'
subIssuesCompleted: 3
subIssuesTotal: 10
blockedBy: []
blocking:
  - '[ ] 10135 Audit Agent OS for Windows support'
---
# [Epic] Cloud-Native Knowledge & Multi-Tenant Memory Core

# Architectural Goal
Transition the Agent OS to a scalable, multi-tenant Hybrid GraphRAG architecture that enforces strict data privacy while enabling autonomous Universal Macro Overlay detection.

## The Strategy
To support both rapid local development and scalable enterprise clusters, we are adopting a Dynamic Configured Topology:
1. **Dynamic Topography**: Support for "Unified Local" mode (single ChromaDB instance) and "Federated Cloud" mode (isolated Knowledge Base and Memory Core instances).
2. **Hardened Identity Ingestion**: Support Multi-Tenant isolation by reliably extracting user identities via reverse-proxy HTTP headers (e.g., `x-auth-request-preferred-username`). All memories and sessions are tagged with `userId` natively in ChromaDB metadata.
3. **Universal Macro DB Topology**: The Knowledge Base will ingest a secondary, unchunked `neo-knowledge-base-macro` index containing 1:1 embeddings for all artifacts (Guides, Source, PRs, Tickets, etc.).
4. **Omnidirectional Semantic Distance**: `DreamService` will execute federated REST queries against the Macro DB to mathematically map gaps across the entire project (e.g. mapping tickets to impacted source code, mapping missing guides to new components). 

*Note: Implementation phases will be tracked via native Sub-Issues linked to this Epic.*

## Timeline

- 2026-04-14T15:09:10Z @tobiu added the `epic` label
- 2026-04-14T15:09:10Z @tobiu added the `ai` label
- 2026-04-14T15:09:10Z @tobiu added the `architecture` label
- 2026-04-14T15:09:40Z @tobiu assigned to @tobiu
- 2026-04-14T15:11:06Z @tobiu added sub-issue #10000
- 2026-04-14T15:11:07Z @tobiu added sub-issue #10001
- 2026-04-14T15:11:09Z @tobiu added sub-issue #10002
- 2026-04-14T15:13:05Z @tobiu added sub-issue #10003
- 2026-04-14T15:13:06Z @tobiu added sub-issue #10004
- 2026-04-14T15:13:08Z @tobiu added sub-issue #10005
- 2026-04-14T15:16:32Z @tobiu added sub-issue #10006
- 2026-04-14T15:18:28Z @tobiu added sub-issue #10007
- 2026-04-14T15:18:30Z @tobiu added sub-issue #10008
- 2026-04-14T15:18:31Z @tobiu added sub-issue #10009
- 2026-04-14T15:18:32Z @tobiu removed sub-issue #10005
- 2026-04-14T15:19:44Z @tobiu added sub-issue #10010
- 2026-04-14T15:22:01Z @tobiu added sub-issue #10011
- 2026-04-14T15:22:03Z @tobiu added sub-issue #10012
- 2026-04-14T16:43:28Z @tobiu cross-referenced by #10013
- 2026-04-14T16:43:31Z @tobiu cross-referenced by #10014
- 2026-04-14T16:43:35Z @tobiu cross-referenced by #10015
- 2026-04-14T16:43:40Z @tobiu cross-referenced by #10016
- 2026-04-14T16:43:52Z @tobiu added sub-issue #10013
- 2026-04-14T16:43:54Z @tobiu added sub-issue #10014
- 2026-04-14T16:43:55Z @tobiu added sub-issue #10015
- 2026-04-14T16:43:56Z @tobiu added sub-issue #10016
- 2026-04-14T16:44:03Z @tobiu removed sub-issue #10003
- 2026-04-14T16:44:05Z @tobiu removed sub-issue #10002
- 2026-04-14T16:44:06Z @tobiu removed sub-issue #10004
- 2026-04-14T16:44:07Z @tobiu removed sub-issue #10006
- 2026-04-14T16:44:09Z @tobiu removed sub-issue #10012
- 2026-04-14T16:44:11Z @tobiu removed sub-issue #10001
- 2026-04-14T16:44:12Z @tobiu removed sub-issue #10007
- 2026-04-14T16:44:14Z @tobiu removed sub-issue #10008
- 2026-04-14T16:44:16Z @tobiu removed sub-issue #10009
- 2026-04-14T16:44:17Z @tobiu removed sub-issue #10000
- 2026-04-14T16:44:19Z @tobiu removed sub-issue #10010
- 2026-04-14T16:44:20Z @tobiu removed sub-issue #10011
- 2026-04-14T22:37:43Z @tobiu referenced in commit `a2d25ea` - "perf(ai): Natively bypass Map-Reduce chunking to eliminate local inference bottlenecks (#9999)"
- 2026-04-14T22:37:51Z @tobiu cross-referenced by PR #10019
- 2026-04-15T08:31:39Z @tobiu referenced in commit `1e03e2a` - "test(memory-core): Add remote API latency assertion to SessionService.spec (#9999)"
- 2026-04-15T08:39:49Z @tobiu referenced in commit `503f60b` - "test(memory-core): Add remote API latency assertion to SessionService.spec (#9999)"
- 2026-04-15T08:49:48Z @tobiu referenced in commit `4db2ad6` - "perf(ai): Natively bypass Map-Reduce chunking to eliminate local inference bottlenecks (#10019)

* perf(ai): Natively bypass Map-Reduce chunking to eliminate local inference bottlenecks (#9999)

* test(memory-core): Add remote API latency assertion to SessionService.spec (#9999)"
- 2026-04-15T10:34:00Z @tobiu cross-referenced by PR #10024
- 2026-04-15T21:55:24Z @tobiu cross-referenced by #10030
### @tobiu - 2026-04-16T18:44:50Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ **Architecture Update:**\nThe originally planned Sub-Epic #10014 (Macro Knowledge Base) has been closed due to semantic dilution problems found during execution.\n\nIt is superseded by **Epic #10030** (Concept Ontology Layer). We are pivoting the Gap Inference Engine from relying on heavy full-file vector comparisons to utilizing a deterministic, version-controlled JSONL Concept Graph and traversal engine via `ai/services.mjs`.

- 2026-04-16T18:44:53Z @tobiu added sub-issue #10030
- 2026-04-16T18:44:58Z @tobiu removed sub-issue #10014
- 2026-04-17T07:27:26Z @tobiu cross-referenced by PR #10047
- 2026-04-17T13:08:56Z @tobiu cross-referenced by PR #10048
- 2026-04-18T14:22:18Z @tobiu cross-referenced by #10061
- 2026-04-18T14:38:10Z @tobiu cross-referenced by PR #10062
- 2026-04-18T14:57:24Z @tobiu cross-referenced by #10063
- 2026-04-18T18:11:51Z @tobiu added sub-issue #10057
- 2026-04-18T18:11:52Z @tobiu cross-referenced by #10057
- 2026-04-18T18:15:34Z @tobiu cross-referenced by PR #10066
- 2026-04-18T23:01:05Z @tobiu cross-referenced by #10074
- 2026-04-19T09:43:06Z @tobiu cross-referenced by #10079
- 2026-04-19T11:34:22Z @tobiu referenced in commit `a32c0af` - "fix(github-workflow): paginate timelineItems to prevent silent content drop (#10090)

The IssueSyncer rendered comment bodies through the unified timelineItems
GraphQL channel, which was page-capped at maxTimelineItemsPerIssue (50) with
no continuation logic. Once an issue's timeline grew past the cap, tail
events including newly-authored comments were silently dropped from the
local markdown while scalar frontmatter metadata (commentsCount, updatedAt)
stayed correct — a divergence between metadata tracking and content
rendering that gave a false appearance of successful sync.

Changes:
- issueQueries: add pageInfo on timelineItems in both FETCH queries and
  introduce FETCH_ISSUE_TIMELINE_PAGE for continuation fetches.
- IssueSyncer: add #exhaustTimelineItems pagination primitive with a warn
  log on continuation; extract the related-issues force-update loop into
  a reusable refetchIssuesByNumber(numbers, metadata) method that both
  pullFromGitHub and external tooling share.
- SyncService: expose refetchIssuesByNumber({numbers}) as the SDK entry
  for surgical recovery bypassing delta-sync updatedAt gating.
- ai/scripts/detectTruncatedTimelines.mjs: diagnostic that flags files
  whose rendered comment blocks fall short of frontmatter commentsCount
  or whose timeline sits exactly at the cap.
- ai/scripts/refetchTruncatedIssues.mjs: thin recovery wrapper that
  consumes the detector output (list or --stdin JSON) and delegates to
  the SyncService endpoint.
- IssueSyncer.spec: Playwright regression covering a 75-event mocked
  issue that forces one continuation page and asserts every comment and
  structural event lands in the rendered markdown.

Recovery artifacts in this commit: issues #10030, #9486, #9999, #9535 —
the four issues flagged as drifted by the detector baseline run — were
healed via the new refetch endpoint and now reflect live GitHub state."
- 2026-04-19T11:35:15Z @tobiu cross-referenced by PR #10091
- 2026-04-19T11:41:30Z @tobiu referenced in commit `3ec8167` - "fix(github-workflow): paginate timelineItems to prevent silent content drop (#10090) (#10091)

The IssueSyncer rendered comment bodies through the unified timelineItems
GraphQL channel, which was page-capped at maxTimelineItemsPerIssue (50) with
no continuation logic. Once an issue's timeline grew past the cap, tail
events including newly-authored comments were silently dropped from the
local markdown while scalar frontmatter metadata (commentsCount, updatedAt)
stayed correct — a divergence between metadata tracking and content
rendering that gave a false appearance of successful sync.

Changes:
- issueQueries: add pageInfo on timelineItems in both FETCH queries and
  introduce FETCH_ISSUE_TIMELINE_PAGE for continuation fetches.
- IssueSyncer: add #exhaustTimelineItems pagination primitive with a warn
  log on continuation; extract the related-issues force-update loop into
  a reusable refetchIssuesByNumber(numbers, metadata) method that both
  pullFromGitHub and external tooling share.
- SyncService: expose refetchIssuesByNumber({numbers}) as the SDK entry
  for surgical recovery bypassing delta-sync updatedAt gating.
- ai/scripts/detectTruncatedTimelines.mjs: diagnostic that flags files
  whose rendered comment blocks fall short of frontmatter commentsCount
  or whose timeline sits exactly at the cap.
- ai/scripts/refetchTruncatedIssues.mjs: thin recovery wrapper that
  consumes the detector output (list or --stdin JSON) and delegates to
  the SyncService endpoint.
- IssueSyncer.spec: Playwright regression covering a 75-event mocked
  issue that forces one continuation page and asserts every comment and
  structural event lands in the rendered markdown.

Recovery artifacts in this commit: issues #10030, #9486, #9999, #9535 —
the four issues flagged as drifted by the detector baseline run — were
healed via the new refetch endpoint and now reflect live GitHub state."
- 2026-04-20T00:44:38Z @tobiu cross-referenced by #10109
- 2026-04-20T02:07:08Z @tobiu cross-referenced by #10120
- 2026-04-20T10:40:37Z @tobiu cross-referenced by PR #10121
- 2026-04-20T11:13:56Z @tobiu cross-referenced by #9748
- 2026-04-20T11:19:03Z @tobiu cross-referenced by PR #10122
- 2026-04-20T13:32:29Z @tobiu cross-referenced by PR #10123
- 2026-04-20T14:38:15Z @tobiu cross-referenced by PR #10128
- 2026-04-20T15:26:36Z @tobiu cross-referenced by PR #10130
- 2026-04-20T19:48:27Z @tobiu cross-referenced by #10135
- 2026-04-20T19:48:52Z @tobiu marked this issue as blocking #10135
- 2026-04-20T20:45:16Z @tobiu cross-referenced by #10136
- 2026-04-20T20:45:24Z @tobiu added sub-issue #10136
- 2026-04-20T23:29:48Z @tobiu cross-referenced by #10139
- 2026-04-20T23:29:54Z @tobiu added sub-issue #10139
- 2026-04-20T23:40:12Z @tobiu cross-referenced by PR #10140
- 2026-04-21T09:28:52Z @tobiu cross-referenced by #10143
- 2026-04-21T09:29:19Z @tobiu cross-referenced by #10146
- 2026-04-21T09:32:43Z @tobiu added sub-issue #10143
### @tobiu - 2026-04-21T17:03:01Z

# Session Handover — 2026-04-21 Cycle Summary + Phase 2+ Delegation

Fresh-session anchor. Both my context window (Claude Opus 4.7 / Claude Code, session `71dc3cd8-d39d-48e1-ac62-e240ca67d1a5`) and Gemini's (Gemini 3.1 Pro / Antigravity, session `7a73e53f-801a-490f-b693-b431189aa1a9` + prior `30e93319-06e2-44d2-adf2-99168a997d08`) are filling up. This comment codifies the current state + delegation so any fresh session can pick up cleanly.

**Updated 2026-04-21:** Phase 1 complete. #10161 merged; #10151 shipped. Phase 2 now unlocked — see below.

---

## What Shipped This Session

### Workflow-infrastructure PRs (5 merged)

| PR | Scope |
|---|---|
| [#10155](https://github.com/neomjs/neo/pull/10155) | `epic-review` skill (5-stage gating chain, vision-fit + approach-elegance + scope-coherence) |
| [#10157](https://github.com/neomjs/neo/pull/10157) | `pr-review` depth-floor mandates + template slots + evaluative-vs-descriptive metric taxonomy |
| [#10160](https://github.com/neomjs/neo/pull/10160) | Epic-Review Pre-Requisite gate in `ticket-intake-workflow.md` |
| [#10142](https://github.com/neomjs/neo/pull/10142) | Self-Identification mandate in `pull-request-workflow.md` + Cross-Harness Authorship Convention |
| [#10163](https://github.com/neomjs/neo/pull/10163) | Review Response Protocol + PR Comment Hygiene + PR Body Hygiene + Authorship Respect + Substrate Awareness + Stale Local Ticket Prevention + Lesson Promotion Path |

### Substantive-work PRs (Phase 1 — both merged)

| PR | Resolves | Status |
|---|---|---|
| [#10162](https://github.com/neomjs/neo/pull/10162) | #10144 AgentIdentity node + seed script + IdentitySchema.md | **Merged** |
| [#10161](https://github.com/neomjs/neo/pull/10161) | #10151 MemorySessionIngestor deterministic ingestion phase | **Merged** |

Phase 1 is closed. Both Opus-track and Gemini-track deliverables shipped; downstream subs (#10152, #10153, #10158, #10145) are now unblocked.

### Tickets filed

| Ticket | Purpose |
|---|---|
| [#10164](https://github.com/neomjs/neo/issues/10164) | Pre-commit cross-PR file-collision check — empirically anchored on this session's three-way #10163 / #10142 / #10160 collision + #10162 post-merge conflict |

---

## Phase-2+ Delegation Table

Proposed assignments — not locked. Whichever identity actually claims the ticket (via `manage_issue_assignees add @me`) owns it. This table records intent for coordination, not a contract.

### Phase 2 (open — Phase 1 complete, begin pickup)

| Ticket | Proposed owner | Rationale |
|---|---|---|
| [#10152](https://github.com/neomjs/neo/issues/10152) Gemma4 extractor provenance edges | **Gemini** | Prompt engineering + Zod schema; Gemini territory. |
| [#10153](https://github.com/neomjs/neo/issues/10153) Lazy back-fill for pre-migration Chroma rows | **Either** | Middle-ground scope; assign based on capacity. |
| [#10158](https://github.com/neomjs/neo/issues/10158) Post-ship telemetry + retention policy | **Either** | Middle-ground scope; assign based on capacity. |
| [#10145](https://github.com/neomjs/neo/issues/10145) OAuth2 Memory-Core MCP auth | **Opus** | MC server internals, convention-sensitive. |

### Phase 3 (opens after phase 2 core lands)

| Ticket | Proposed owner | Rationale |
|---|---|---|
| [#10146](https://github.com/neomjs/neo/issues/10146) Cross-tenant perms + test suite | **Opus** | Integration-heavy; spans mailbox + identity + auth. |
| [#10147](https://github.com/neomjs/neo/issues/10147) Message node schema + addMessage/listMessages/markRead tools | **Opus** | Central integration point; decisions cascade to D2/D3/D4. |

### Phase 4 (opens after #10147 merges)

| Ticket | Proposed owner |
|---|---|
| [#10148](https://github.com/neomjs/neo/issues/10148) Lifecycle (archive/delete + retracted-marker) | **Gemini** |
| [#10149](https://github.com/neomjs/neo/issues/10149) Healthcheck inbox/outbox preview | **Gemini** |
| [#10150](https://github.com/neomjs/neo/issues/10150) Optional Chroma semantic layer | **Either** |

---

## Cross-Model PR Review Pattern

Validated empirically across 4+ review cycles this session — both directions now produce substantive reviews when backed by the enhanced `pr-review` skill:

- **Gemini reviews Opus PRs**; **Opus reviews Gemini PRs**.
- Both apply `pr-review` skill mandates: §3.1 Score Justification, §7 Depth Floor, §8 Cross-Skill Integration Audit, §5 Zero-Issue PR Semantics.
- Authors respond via `pull-request` §7 Review Response Protocol using `[ADDRESSED]` / `[DEFERRED]` / `[REJECTED_WITH_RATIONALE]` tags.
- PR-body Self-Identification per `pull-request` §5 (top-of-body `Authored by [Model] ([Harness]). Session <uuid>.`).
- For same-session self-authored PRs: `pr-review` §1.3 self-review mode (clinical, first-person, actively hunt for blind spots).

---

## Epic-Review Status

Per `epic-review` skill §5 (per-agent-per-epic one-shot):

| Epic | Gemini identity | Opus identity |
|---|---|---|
| [#10143](https://github.com/neomjs/neo/issues/10143) Graph-first Memory artifacts | ✓ Reviewed (session `7a73e53f-801a-490f-b693-b431189aa1a9`) | Not reviewed (authored the epic; author-self-review skill ambiguity flagged as v1.1 candidate — skip OK for now) |
| [#10016](https://github.com/neomjs/neo/issues/10016) Multi-Tenant Identity & Data Privacy | Not reviewed | Not reviewed |
| [#10139](https://github.com/neomjs/neo/issues/10139) Mailbox — explicit A2A primitive | Not reviewed | Not reviewed (authored the reshape) |

**Rule:** whichever identity picks up the first sub from #10016 or #10139 runs `epic-review` before ticket-intake on that sub. If both identities pick up subs, both run independent reviews (cross-model asymmetry is the feature per `epic-review-workflow.md` §8).

---

## Outstanding Follow-ups

- **[#10164](https://github.com/neomjs/neo/issues/10164)** (unassigned) — pre-commit cross-PR file-collision check. Empirical cases #1 + #2 = #10163/#10142/#10160 + #10162 post-merge collision. Consolidation candidate with a stale-local-ticket mechanical guard if the Stale Prevention rule fails in practice (not filed separately; file combined later if either/both discipline rules fail empirically).

- **v1.1 skill-refinement candidates** (track only; file if empirical 3+ instance):
  - `[BLOCKED_BY]` fourth tag for `pull-request` §7 (blocked-on-upstream-merge case — observed once with Gemini's #10163 `[DEFERRED]` stretch)
  - `epic-review` author-self-review mode documentation (ambiguity around whether epic author runs epic-review on own authored epic)

---

## For Fresh-Session Boot

### Memory Core session IDs for context mining

Opus:
- `71dc3cd8-d39d-48e1-ac62-e240ca67d1a5` (this session — workflow infrastructure + Phase 1 Opus track)
- `5a521819-dc75-4549-888e-fcea818d0401` (prior session — MX paradigm discussion #10137)
- `a38d25d1-3003-4d57-b0ac-0effe2c3507e` (prior session — #10139 mailbox original filing)

Gemini:
- `7a73e53f-801a-490f-b693-b431189aa1a9` (this session — workflow infrastructure + #10144 + epic-review on #10143)
- `30e93319-06e2-44d2-adf2-99168a997d08` (prior session — #10141 / #10142 Self-Identification origin)

### Next Concrete Actions

**Opus track (Phase 2 entry):**
1. Begin [#10145](https://github.com/neomjs/neo/issues/10145) OAuth2 Memory-Core MCP auth.
2. Phase 3 entry: [#10147](https://github.com/neomjs/neo/issues/10147) Message schema after phase 2 core lands.
3. Phase 3 follow-through: [#10146](https://github.com/neomjs/neo/issues/10146) Cross-tenant perms + test suite.

**Gemini track (Phase 2 entry):**
1. Begin [#10152](https://github.com/neomjs/neo/issues/10152) Gemma4 extractor provenance edges — attaches extracted entities to Memory/Session nodes now that #10151 has shipped.
2. Phase 4 entry: [#10148](https://github.com/neomjs/neo/issues/10148) Lifecycle and [#10149](https://github.com/neomjs/neo/issues/10149) Healthcheck preview after #10147 ships.

**Either track (pick based on capacity):**
- [#10153](https://github.com/neomjs/neo/issues/10153) Lazy back-fill — middle-ground scope.
- [#10158](https://github.com/neomjs/neo/issues/10158) Post-ship telemetry + retention — middle-ground scope.

### Session-Boot Checklist (for both agents)

1. Run `neo-mjs-github-workflow:sync_all` (or `gh issue view #9999`) to fetch latest state of this comment thread — per `ticket-intake-workflow.md` §1 Stale Local Ticket Prevention.
2. Read this handover comment for delegation + phase state.
3. `query_raw_memories` against Memory Core with the prior-session IDs above for deep context on any thread you're picking up.
4. Before first sub-pickup from #10016 or #10139: run `epic-review` skill (per §5 per-agent-per-epic one-shot).
5. Self-identify in PR bodies per `pull-request-workflow.md` §5. Use the Review Response Protocol per §7 when receiving Request Changes.

---

Origin Session ID: `71dc3cd8-d39d-48e1-ac62-e240ca67d1a5`


- 2026-04-21T18:27:01Z @tobiu cross-referenced by PR #10165

