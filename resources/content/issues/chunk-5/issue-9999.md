---
id: 9999
title: '[Epic] Cloud-Native Knowledge & Multi-Tenant Memory Core'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-14T15:09:09Z'
updatedAt: '2026-06-06T16:02:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9999'
author: tobiu
commentsCount: 11
parentIssue: null
subIssues:
  - '[x] 10013 [Sub-Epic] DreamService Decomposition'
  - '[x] 10015 [Sub-Epic] Dynamic Topology — Unified vs. Federated Routing'
  - '[x] 10016 [Sub-Epic] Multi-Tenant Identity & Data Privacy'
  - '[x] 10030 [Epic] Concept Ontology & Semantic Gap Inference'
  - '[x] 10057 Knowledge Base: Add PullRequestSource for PR Conversation Embeddings'
  - '[x] 10127 HealthService: surface effective unified/federated topology in /health'
  - '[x] 10129 Backup: atomic timestamped bundle across all persistent subsystems'
  - '[x] 10136 Rewrite CodebaseOverview.md to reflect Two Hemispheres architecture + Dream Pipeline'
  - '[x] 10139 Extend Memory Core with Explicit A2A Primitive'
  - '[x] 10143 Graph-first Memory artifacts: lift Memory + Session to first-class nodes'
  - '[x] 10587 Capture runSandman inference hard-failures durably'
  - '[x] 10691 Shared KB/MC Team Deployment MVP'
  - '[x] 10721 Shared deployment MVP completeness gaps (post-#10691)'
  - '[x] 10800 Author cloud deployment cookbook for shared KB+MC topology'
  - '[x] 10807 Docker Compose integration test fixture for shared KB+MC deployment'
  - '[x] 10808 Operator-facing env var ergonomics: descriptive names + Chroma host/port overrides'
  - '[x] 10813 Restore session summaries: primary-flag gate + sunset-event trigger'
  - '[x] 10822 Config substrate cleanup: KISS hard cuts + three-tier model'
  - '[x] 10945 Expand deployment-pipeline integration coverage for Memory Core'
  - '[x] 10957 Document v13 architectural path — slim MCP servers, orchestrator daemon, SDK migration sequence'
  - '[x] 10960 v13 Release Tracking — main-focus-items canonical sub-issue tree'
  - '[x] 11009 Move Orchestrator logic into Neo daemon class'
  - '[x] 11720 Cloud Agent OS Deployment Readiness'
  - '[x] 11730 Cloud Agent OS Deployment — Post-MVP Residual Workstreams'
  - '[x] 11731 Server-side tenant-repo ingestion for cloud Agent OS deployments'
subIssuesCompleted: 25
subIssuesTotal: 25
blockedBy: []
blocking:
  - '[ ] 10135 Audit Agent OS for Windows support'
closedAt: '2026-06-06T16:02:54Z'
---
# [Epic] Cloud-Native Knowledge & Multi-Tenant Memory Core

# Architectural Goal
Transition the Agent OS to a scalable, cloud-deployable Memory Core + Knowledge Base substrate for v13: shared institutional memory, authenticated agent/user identity, explicit team-vs-private retrieval policy, and graph-native self-evolution loops.

This epic remains the v13 umbrella for Cloud-Native Knowledge and Multi-Tenant Memory Core work. Some early framing below was superseded during execution; this body is the current cold-reader entry point, while the comment thread preserves the historical handovers.

## Current Strategy

1. **Unified Shared Deployment Topology**
   - Current product path is a unified ChromaDB topology for Knowledge Base and Memory Core collections, with separate MCP server tool surfaces.
   - The earlier "Federated Cloud" / separate-KB-and-MC Chroma process direction is historical unless a future ticket reopens it with fresh evidence.

2. **Identity, Auth, and Provenance**
   - Memory Core writes must carry server-resolved identity provenance (`userId` / AgentIdentity), never client-spoofed identity fields.
   - OIDC / proxy identity / stdio identity are deployment-level identity sources; config and healthcheck surfaces must make the active identity mode observable.

3. **Team vs Private Retrieval Policy**
   - #10010 owns retrieval-side `memorySharing` behavior for `query_raw_memories` and `query_summaries`.
   - Source of authority: `learn/agentos/tooling/MultiTenantMigrationGuide.md`.
   - Current policy shape is the `memorySharing` enum (`legacy`, `private`, `team`), not the obsolete boolean `NEO_ENABLE_TEAM_MEMORY` sketch.
   - Writes remain provenance-stamped regardless of read policy.

4. **Native Edge Graph Tenant Isolation**
   - #10011 owns SQLite / Native Edge Graph RLS and tenant isolation semantics.
   - Chroma memory/session retrieval and graph RLS must stay aligned, but they are distinct enforcement layers.

5. **Concept Ontology Replaces Macro DB**
   - The original Universal Macro DB / unchunked full-file vector approach was retired after semantic dilution was observed.
   - #10030 Concept Ontology is the active replacement: deterministic, version-controlled concept nodes plus traversal-based gap inference.

6. **Graph-First Memory and A2A Coordination**
   - AgentIdentity, memory/session nodes, mailbox/A2A primitives, and provenance edges are part of this epic's institutional substrate.
   - Cross-agent coordination and review loops are not side processes; they are data-producing parts of the Memory Core organism.

7. **Operator Observability and Recovery**
   - Healthcheck topology, migration state, backup surfaces, Sandman / Dream Pipeline observability, and daemon diagnostics are part of the deployment story.
   - Boot-time auto-runs remain intentionally gated; operator-invoked and daemon-supervised paths must be observable without multiplying writes across MCP server instances.

## Active Critical Path

- #10016: Multi-Tenant Identity & Data Privacy parent.
- #10010: Memory Core team/private retrieval policy (`memorySharing`).
- #10011: Native Edge Graph RLS / tenant isolation.
- #10030: Concept Ontology and semantic gap inference replacement for Macro DB.
- Shared deployment docs and healthcheck surfaces: keep operator-facing topology, identity, migration, and provider state falsifiable.

## Avoided Traps

- Do not revive the full-file Macro DB vector approach without new evidence addressing semantic dilution.
- Do not implement a boolean-only team-memory flag; use the `memorySharing` enum contract.
- Do not backfill legacy records with synthetic tenant ownership; lazy-tag-on-read is the migration strategy.
- Do not split storage per tenant at this layer unless a new operational/security argument beats the current metadata + graph policy model.
- Do not close #9999 while native sub-issues remain open; prior reopen workflow churn proved parent-state semantics are load-bearing.

## Notes

Implementation phases are tracked by native sub-issues linked to this epic. If a sub-ticket body conflicts with `MultiTenantMigrationGuide.md`, `SharedDeployment.md`, `MemoryCoreMcpAuth.md`, or the current code/tests, treat the ticket body as stale input and reshape it during ticket intake before implementation.


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
- 2026-04-21T19:06:54Z @tobiu cross-referenced by PR #10166
- 2026-04-21T21:06:49Z @tobiu cross-referenced by PR #10167
- 2026-04-21T22:30:26Z @tobiu cross-referenced by PR #10170
- 2026-04-21T22:47:30Z @tobiu cross-referenced by PR #10171
- 2026-04-21T23:19:24Z @tobiu cross-referenced by #10172
### @tobiu - 2026-04-22T09:09:42Z

# Session Handover — 2026-04-21 Evening Cycle

**Updated 2026-04-22T09:15Z** — corrected #10139 epic-review status (Gemini did post, multiple times; original comment mis-stated "Not formally reviewed").

Fresh-session anchor following six PR-cycles on top of the 17:03 handover above. Both context windows (Opus session `d69ac7a0-9fe8-4416-b766-cd9edb8bee71`, Gemini session `ada4aecb-60fc-4b25-a76b-cb92600835a2`) are winding down. Phase 3 closed + Phase 4 entry points open. This comment codifies current state for any fresh session.

---

## What Shipped This Cycle

### Substantive-work PRs (5 merged)

| PR | Resolves | Author | Status |
|---|---|---|---|
| [#10165](https://github.com/neomjs/neo/pull/10165) | #10152 Gemma4 extractor provenance edges + lazy-queue producer | Gemini | **Merged** |
| [#10166](https://github.com/neomjs/neo/pull/10166) | #10145 stdio identity + anti-spoof guard | Opus | **Merged** |
| [#10167](https://github.com/neomjs/neo/pull/10167) | #10146 + #10147 bundled: permissions + mailbox primitives | Gemini | **Merged** |
| [#10170](https://github.com/neomjs/neo/pull/10170) | #10168 test coverage + role-based addressing + serial fixture isolation | Gemini | **Merged** |
| [#10171](https://github.com/neomjs/neo/pull/10171) | #10153 lazy back-fill consumer + priorityBackfill CLI | Opus | **Merged** |

**Actuals shifted from the 17:03 handover's proposed delegation:** Gemini picked up the Opus-track Phase 3 (#10147 + #10146 bundled as option A); Opus picked up the Gemini-track-candidate #10153 (lazy back-fill) since Gemini was in-context on the mailbox work. Net: same substrate coverage, different track attribution. The bundling + scope-split decisions were negotiated in the planning exchanges visible on this ticket.

### Tickets filed this cycle

| Ticket | Purpose | Parent |
|---|---|---|
| [#10168](https://github.com/neomjs/neo/issues/10168) | Mailbox test-coverage expansion + role-based addressing | #10139 |
| [#10169](https://github.com/neomjs/neo/issues/10169) | `TAGGED_CONCEPT` auto-emit via `SemanticGraphExtractor` on message bodies | #10143 |
| [#10172](https://github.com/neomjs/neo/issues/10172) | Graph node-ID case canonicalization (lowercase `memory:` vs uppercase `MEMORY:`) | #10143 |

---

## Remaining Open Work

### Phase 4 Mailbox subs (now unblocked by #10167 merge)

| Ticket | Proposed owner | Notes |
|---|---|---|
| [#10148](https://github.com/neomjs/neo/issues/10148) Lifecycle (archive/delete + retracted-marker) | **Gemini** | Gemini in-context on mailbox substrate from #10167 / #10170. |
| [#10149](https://github.com/neomjs/neo/issues/10149) Healthcheck extension (inbox/outbox preview) | **Gemini** | Pairs naturally with #10158 telemetry surface. |
| [#10150](https://github.com/neomjs/neo/issues/10150) Optional Chroma semantic layer for "find related messages" | **Either** | Middle-ground; extractor-adjacent (Gemini context) vs retrieval-layer (either). |

### Phase 3 follow-ups from this cycle

| Ticket | Proposed owner | Rationale |
|---|---|---|
| [#10169](https://github.com/neomjs/neo/issues/10169) `TAGGED_CONCEPT` auto-emit | **Gemini** | `SemanticGraphExtractor` territory; Gemini deep context from #10152 / #10165. |
| [#10172](https://github.com/neomjs/neo/issues/10172) Node-ID case canonicalization | **Either** | Option A (lowercase canonical, cheaper) vs Option B (uppercase canonical, DB migration). Opus leans A. |
| [#10158](https://github.com/neomjs/neo/issues/10158) Post-ship telemetry + retention | **Either** | Surfaced by Gemini's epic-review on #10143; still unassigned. |

### Workflow follow-ups still pending

| Ticket | Status |
|---|---|
| [#10164](https://github.com/neomjs/neo/issues/10164) Pre-commit cross-PR file-collision check | Unassigned; empirical cases from prior sessions still live. |

---

## Cross-Model PR Review Empirical Data

Four cross-model review cycles validated this session — pattern holds across code-scope, workflow-scope, and plumbing-scope PRs:

| Review direction | PR | Surface-level outcome |
|---|---|---|
| Opus → Gemini | #10165 | 3 polish items (`/tmp` convention, JSDoc gap, partial coverage) → addressed in single follow-up |
| Opus → Gemini | #10167 | Scope reconciliation (6 of 8 edge types missing) + openapi duplicate blocker → addressed cleanly |
| Opus → Gemini | #10170 | 5 polish items (RA1–RA5) → addressed in single follow-up |
| Gemini → Opus | #10171 | 2 Depth Floor challenges (SIGKILL orphan, canonical-case debt) → `[ADDRESSED]` + `[DEFERRED]` to #10172 |

**Cross-model asymmetry confirmed empirically:** Opus reviews lean toward structural/coverage/scope concerns; Gemini reviews lean toward edge-case/timing/failure-mode concerns. Complementary — the `pr-review` §7.2 cross-model asymmetry framing holds.

**Protocol observation:** Gemini consistently used flat-bullet addressing comments; Opus used the canonical `pull-request` §7.2 `[ADDRESSED]` / `[DEFERRED]` / commit-SHA / `Re-review requested.` taxonomy. Content parity; graph-ingestible shape differs. Worth tracking for Retrospective daemon empirical-pattern mining.

---

## Identity & Harness Configuration

**GitHub accounts provisioned** (this session, post-merge by @tobiu):
- `@neo-opus-ada` — Claude Opus 4.7 identity
- `@neo-gemini-pro` — Gemini 3.1 Pro identity
- Both 2FA-secured, classic tokens issued, `@neomjs.com` email addresses.

**Immediate harness-config action for next session** (no code change needed):

```json
// .claude/settings.json
"env": { "NEO_AGENT_IDENTITY": "neo-opus-ada" }

// .gemini/settings.json
"env": { "NEO_AGENT_IDENTITY": "neo-gemini-pro" }
```

Without these, both harnesses fall through to `gh api user` → `@tobiu` and Mailbox `SENT_BY` edges collapse to the same graph node, losing cross-model differentiation.

See `learn/agentos/tooling/MemoryCoreMcpAuth.md` §Harness Configuration for the full snippets.

---

## For Fresh-Session Boot

### Memory Core session IDs for context mining

Opus:
- `d69ac7a0-9fe8-4416-b766-cd9edb8bee71` (this session — #10145 + #10153 + four reviews)
- `71dc3cd8-d39d-48e1-ac62-e240ca67d1a5` (prior session — workflow infrastructure + Phase 1 Opus track)

Gemini:
- `ada4aecb-60fc-4b25-a76b-cb92600835a2` (this session — #10152 + #10146 + #10147 + #10168 + epic-review on #10139)
- `7a73e53f-801a-490f-b693-b431189aa1a9` (prior — #10144 + epic-review on #10143)

### Epic-Review Status

| Epic | Gemini identity | Opus identity |
|---|---|---|
| [#10143](https://github.com/neomjs/neo/issues/10143) Graph-first Memory artifacts | ✓ Reviewed (prior session) | Author-self-skip (authored the epic) |
| [#10016](https://github.com/neomjs/neo/issues/10016) Multi-Tenant Identity & Data Privacy | ✓ Reviewed (prior session) | ✓ Reviewed (this session 2026-04-21T18:22Z) |
| [#10139](https://github.com/neomjs/neo/issues/10139) Mailbox A2A | ✓ Reviewed (this session — three comments 20:27Z, 21:02Z, 23:03Z; all 5-stage greenlights) | Author-self-skip (authored the reshape) |

All three active epics now have their cross-model epic-review coverage. Phase 4 sub pickups don't need new epic-reviews (per-agent-per-epic one-shot satisfied).

### Next Concrete Actions

**Opus track:**
1. If Phase 4 mailbox work is available to Opus (not natural given Gemini's in-context advantage), pick up a middle-ground alternate — [#10172](https://github.com/neomjs/neo/issues/10172) canonical-case settlement is well-scoped Opus work.
2. Or [#10164](https://github.com/neomjs/neo/issues/10164) pre-commit cross-PR file-collision check — workflow tooling, quick win.

**Gemini track:**
1. [#10148](https://github.com/neomjs/neo/issues/10148) Mailbox lifecycle — continues the #10167 / #10170 arc.
2. [#10149](https://github.com/neomjs/neo/issues/10149) Mailbox healthcheck preview — pairs well with Gemini's substrate knowledge.
3. [#10169](https://github.com/neomjs/neo/issues/10169) `TAGGED_CONCEPT` Gemma4 auto-emit — `SemanticGraphExtractor` territory.

**Either track (pick by capacity):**
- [#10158](https://github.com/neomjs/neo/issues/10158) telemetry + retention
- [#10150](https://github.com/neomjs/neo/issues/10150) Chroma semantic layer

### Session-Boot Checklist (for both agents)

1. Confirm `NEO_AGENT_IDENTITY` is set in harness config → graph-node binding should resolve to `@neo-opus-ada` / `@neo-gemini-pro` at startup (visible in memory-core server log as `[neo-memory-core MCP] Identity: <login> via env-var — bound to @<login>`).
2. Run `neo-mjs-github-workflow:sync_all` to pull the latest ticket state.
3. Read this handover comment for delegation + phase state.
4. `query_raw_memories` against Memory Core with the prior-session IDs for deep context on any thread you're picking up.
5. Self-identify in PR bodies per `pull-request-workflow.md` §5.
6. Use the `[ADDRESSED]` / `[DEFERRED]` / `[REJECTED_WITH_RATIONALE]` tag taxonomy per §7.2 when responding to reviews — improves Retrospective daemon ingestion.

---

Origin Session ID: `d69ac7a0-9fe8-4416-b766-cd9edb8bee71` (Claude Opus 4.7 / Claude Code)


- 2026-04-22T15:39:04Z @neo-opus-ada cross-referenced by #10179
- 2026-04-23T12:41:30Z @neo-opus-ada cross-referenced by #10237
- 2026-04-23T17:29:49Z @neo-opus-ada cross-referenced by #10252
- 2026-04-23T17:39:54Z @neo-opus-ada cross-referenced by PR #10253
- 2026-04-23T17:55:24Z @neo-opus-ada cross-referenced by #10251
- 2026-04-23T18:12:08Z @neo-opus-ada cross-referenced by #10255
- 2026-04-23T18:38:37Z @neo-opus-ada cross-referenced by #10257
- 2026-04-23T18:47:10Z @neo-opus-ada cross-referenced by PR #10258
- 2026-04-23T21:03:00Z @neo-opus-ada cross-referenced by #10259
- 2026-04-23T21:58:55Z @neo-gemini-pro cross-referenced by PR #10265
- 2026-04-23T22:04:39Z @neo-opus-ada cross-referenced by PR #10266
### @neo-opus-ada - 2026-04-23T22:22:28Z

**Input from Claude Opus 4.7 (Claude Code):**

> ❋ # Session Handover — 2026-04-23 / 2026-04-24 Cycle
> 
> **Session anchor**: Claude Opus 4.7 (Claude Code) session `cff20948-2dbb-4ac4-99e2-df2ebe967a4b` (primary); Gemini 3.1 Pro (Antigravity) session `1c5933cc-a2d0-4296-ae3f-f4e815d385a2`. Both context windows saturating — this comment codifies the state so a fresh session (either identity) can pick up cleanly.
> 
> ## The Big Win: A2A Substrate Fully Operational
> 
> Priority 0 for #10139 closed empirically this session. The full 5-layer A2A stack now composes end-to-end with zero manual SQLite queries and zero harness-restart workarounds:
> 
> | Layer | Ticket / PR | Authored |
> |---|---|---|
> | Auth + stdio identity | #10145 / #10166 | Claude (prior session) |
> | Identity binding (await unwrap) | #10249 / #10250 | Claude |
> | Write-path edges (normalization) | #10259 / #10262 | Claude |
> | Cross-process read coherence | #10257 / #10258 + #10260 / #10261 | Claude + Gemini |
> | Config-gated reply policy | #10252 / #10253 | Claude |
> | Per-agent blocking (BLOCKED_BY) | #10255 / #10266 | Gemini |
> 
> **Empirical verification**: post-merge of #10258 + #10261 + harness restart, direct-DM between `@neo-opus-ada` ↔ `@neo-gemini-pro` works bidirectionally. `list_messages` surfaces peer writes on first call. `from` attribution populated correctly. `mailbox.defaultReplyPolicy: 'open'` enables first-contact DM without bootstrap workarounds.
> 
> ## Docs + Pattern Codification (shipped)
> 
> - **PR #10254** — `.github/AI_QUICK_START.md` three-harness parity (Claude Desktop config added) + `.neo-ai-data` symlink convention + `NEO_AGENT_IDENTITY` placement discipline + `⌘Q` restart gotcha
> - **PR #10263** — Empirical Isolation-Test-After-Review pattern codified symmetrically in `pr-review §5.1` + `pull-request §7.10`; Fresh MCP Client Isolation Strategy in `debugging-antigravity` + `self-repair`; WAL-lock troubleshooting with two-layer fix (busy_timeout + await unwrap) in `MemoryCoreMcpAuth.md` **[approved, awaiting merge]**
> - **PR #10265** — `MultiTenantMigrationGuide.md` as design source of truth for #10017; `healthcheck.migration.untaggedCount` observability surface; `WriteSideInvariant.spec.mjs` regression guard **[open for review]**
> 
> ## #9999 Remaining Critical Path
> 
> ### Sub-epic #10016 — Multi-Tenant Identity & Data Privacy (3/7 → 4/7 done post-merge)
> 
> | Ticket | Status | Track | Depends On |
> |---|---|---|---|
> | #10000 Hardened identity ingestion | ✅ done | — | — |
> | #10144 AgentIdentity node type | ✅ done | — | — |
> | #10145 OAuth2 MCP auth | ✅ done | — | — |
> | #10146 Cross-tenant permission edges | ✅ done | — | — |
> | **#10017 Migration strategy** | 🟡 PR #10265 open | Claude | awaiting merge |
> | **#10010 Team vs Private flag** | ⏸ queued | Gemini | #10017 merge (design anchor) |
> | **#10011 SQLite RLS + tenant isolation** | ⏸ queued | Gemini | #10017 merge (design anchor) |
> 
> ### Sub-epic #10015 — Dynamic Topology (2/4 done)
> 
> | Ticket | Status | Track | Notes |
> |---|---|---|---|
> | #10001 Unified vs federated routing | ✅ done | — | — |
> | #10007 Bypass db init in unified mode | ✅ done | — | — |
> | **#10008 Playwright: unified topology** | ⏸ queued | Gemini | coordinate with @tobiu on `config.template.mjs` boundaries first |
> | **#10009 Playwright: federated topology** | ⏸ queued | Gemini | same coordination gate |
> 
> ### Standalone #9999 subs
> 
> | Ticket | Status | Track | Notes |
> |---|---|---|---|
> | **#10127 Healthcheck topology surface** | ⏸ open | Either | Quick Win shape; pure aggregation; already-spec'd |
> | #10136 CodebaseOverview Two-Hemispheres rewrite | ⏸ open | Either | Orthogonal to deployment-critical path |
> 
> ### Out-of-band tickets filed this session
> 
> | Ticket | Status | Purpose |
> |---|---|---|
> | #10267 | 🟠 unassigned | Investigate gh-workflow MCP sync-metadata.json no-op-diff pollution (Option C recommended — split timestamps into gitignored sidecar) |
> 
> ## Pending Operational Step (tobi-side)
> 
> The `normalizeGraphIdentities.mjs` migration script (#10259 / PR #10262, **already merged**) has NOT yet been run with `--apply` on the primary SQLite. The graph still contains the pre-#10144 aliases `@opus` + `@gemini` plus test-fixture leakage `AGENT:alice` + `AGENT:bob`. Next session's operator step:
> 
> ```bash
> # 1. Review the plan
> node ai/scripts/normalizeGraphIdentities.mjs
> 
> # 2. Commit atomically
> node ai/scripts/normalizeGraphIdentities.mjs --apply
> 
> # 3. Restart all MCP harnesses (⌘Q + relaunch Claude Desktop + Antigravity)
> ```
> 
> After apply: Gemini's stuck `MESSAGE:64a3ba28-...` ("Re: hello all") routed to `@opus` becomes reachable at canonical `@neo-opus-ada` inbox.
> 
> ## Division of Labor Going Forward
> 
> Confirmed via A2A exchange this session (`MESSAGE:d559987d` thread):
> 
> **Claude track** (once #10265 merges):
> - Support Gemini's #10010 / #10011 via `MultiTenantMigrationGuide.md` as design reference
> - Pick up **#10127** (Quick Win observability) as next solo track
> - Available for ad-hoc polish / cross-family review coverage on her PRs
> 
> **Gemini track** (blocked on #10017 merge to pin `memorySharing` enum semantics):
> - **#10011** (SQLite RLS + tenant isolation) — deepest substrate, her lane
> - **#10010** (Team vs Private retrieval flag) — pairs with #10011 (tag-on-write + filter-on-read feature pair)
> - **#10008 / #10009** (Playwright topology coverage) — after tobi coordination on `config.template.mjs` scope boundaries
> 
> ## Key Retrospectives for Future Sessions
> 
> Captured across this session's PR reviews + ticket bodies. All are graph-ingestible via `query_summaries` / `query_raw_memories`:
> 
> 1. **Cross-family review catches what solo review misses** — every substrate fix in the #10241 → #10266 chain had a catch landed by the *other* family. Empirical substrate of the `#10208` / `#10211` mandate. Pattern now codified symmetrically via #10263 (`pr-review §5.1` + `pull-request §7.10`).
> 
> 2. **Empirical Isolation-Test-After-Review** as architectural-dispute resolution primitive — converts theoretical debate into binary empirical results in ~5 minutes of harness time. Self-demonstrated by Gemini's revision cycle on #10263 where she adopted the proposed revision verbatim rather than re-debating.
> 
> 3. **Lazy-tag-on-read is the #10017 prescription**, not back-fill. Full rationale in `MultiTenantMigrationGuide.md §Core Decision` + the #10017 reshape note. Four concrete arguments against back-fill are the load-bearing precedent for any future "should we back-fill legacy data?" question.
> 
> 4. **"Scope-name intuition was correct, prescription layer needed reshape"** as a recurring pattern — `#10251 → #10252 → #10255 → #10266` (BLOCKED_BY substrate-flip → config-gated + additive primitive) is the canonical example. When a reviewer flags a prescription but the author's core concept is sound, reshape at the right substrate instead of rejecting wholesale.
> 
> 5. **Diagnostic primitives should be shell-invokable CLIs**, not additional MCP tool surface, when the diagnostic's whole purpose is to bypass the MCP tool cache (Fresh MCP Client Primitive per #10263). Self-referential recursion-avoidance insight.
> 
> 6. **"Ensure isolation test reproduces the full failure condition"** — my #10253 Phase-2 isolation test ran in single-harness mode and incorrectly confirmed `busy_timeout` alone would close the race; under real 6-process swarm load, #10258 + #10261 had to close additional gaps. Future isolation tests: reproduce the full operational load, not simplified variants.
> 
> ## Session IDs for Memory Mining
> 
> **Claude Opus 4.7 / Claude Code** (chronological, most recent last):
> - `d3cf73b4-21b0-419c-9921-feb472e5a693` — #10241 plan-mode exploration
> - `5f746864-85c4-4b2c-bd79-64c76a8a2be3` — #10249 await discovery
> - `57b8fba5-2bd4-4446-ab46-6d1c9086a19d` — #10252 / #10253 config-gated reply policy
> - `7ad90eb3-2218-4200-977b-fbfe546d64a8` — #10258 cross-process coherence + #10259 identity normalization
> - `29f490c0-41ed-4846-a767-287552d5c3c4` — Post-#10258 merge, first direct-DM empirical success
> - `cff20948-2dbb-4ac4-99e2-df2ebe967a4b` — #10017 intake reshape + implementation + this handover
> 
> **Gemini 3.1 Pro / Antigravity**:
> - `1ca26c19-dd3c-4f74-ae42-51409514d40c` — #10242 original, busy_timeout work
> - `1c5933cc-a2d0-4296-ae3f-f4e815d385a2` — #10260 / #10261 syncCache + #10263 docs consolidation + #10264 / #10266 opportunistic pickups
> 
> ## Fresh-Session Boot Checklist
> 
> 1. **Confirm harness identity**: `healthcheck` → `identity.bound: true, nodeId: '@neo-opus-ada'` or `'@neo-gemini-pro'`. If unbound, restart harness (verify `NEO_AGENT_IDENTITY` env var per `AI_QUICK_START §5 Core Configuration`).
> 
> 2. **Check tobi's pending operational step**: if `@opus` + `@gemini` still appear in SQLite (`search_nodes` query 'AgentIdentity'), prompt him to run `normalizeGraphIdentities.mjs --apply`. If clean, skip.
> 
> 3. **Check PR state**: `list_pull_requests` for open PRs. At handover time: PR #10263 (approved, awaiting merge) + PR #10265 (open, awaiting review).
> 
> 4. **Cross-family coordination first**: before picking up any #9999 sub, A2A mailbox handshake (`list_messages`) to see if the other track has posted a coordination message. Direct-DM to the other identity works without workarounds post-#10258.
> 
> 5. **Priority order for next pickup**:
>    - **If you're Gemini**: wait for #10265 merge, then #10011 first (substrate-heavy, unblocks #10010)
>    - **If you're Claude**: #10127 (Quick Win) OR stand-by for cross-family review coverage on Gemini's #10011 PR
> 
> 6. **Before first code change**: `ticket-intake` skill. If the ticket's prescription predates a substrate change this session codified (especially #10144 graph-first identity), reshape rather than accept blindly. The #10017 reshape note is the canonical example of the pattern.
> 
> ---
> 
> **Session end state**: A2A operational, design anchor for #10017 in PR review, cross-family review pattern well-exercised, `#9999` remaining critical path scoped and tracked. Fresh session picks up with the operational step + #10265 merge + Gemini's #10011 start; I pick up #10127 on the next Claude-track session.
> 
> Origin Session ID (this handover): `cff20948-2dbb-4ac4-99e2-df2ebe967a4b`

- 2026-04-23T23:12:00Z @neo-gemini-pro cross-referenced by PR #10269
- 2026-04-23T23:54:09Z @neo-gemini-pro closed this issue
- 2026-04-23T23:54:09Z @neo-gemini-pro referenced in commit `d997e44` - "fix(memory-core): implement native SQLite RLS and stabilize isolation (#9999) (#10269)

* fix(ai): stabilize multi-tenant rls test harness (#9999)

* fix(memory-core): stabilize RLS isolation, identity stamping, and tests (#10269)

- Ensured user_id identity stamping in GraphService.upsertNode and linkNodesAsync.
- Awaited searchNodes test calls as they return Promises.
- Removed SQLite.mjs debug console.logs and cleaned up whitespace.
- Updated MultiTenantMigrationGuide.md with SQLite RLS specifics.

* fix(memory-core): opt-out A2A routing edges from RLS and align node stamping (#10269)

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"
- 2026-04-24T00:21:10Z @neo-opus-ada cross-referenced by #10272
- 2026-04-24T23:19:50Z @neo-opus-ada cross-referenced by PR #10308
- 2026-04-25T03:54:22Z @tobiu reopened this issue
- 2026-04-25T03:54:28Z @github-actions closed this issue
### @github-actions - 2026-04-25T03:54:29Z

❌ Tickets cannot be reopened. Created new ticket: #10322

### @neo-opus-ada - 2026-04-25T03:57:38Z

Reopened by @neo-opus-ada per @tobiu directive: epic was closed with 7 of 10 sub-issues still open (only 3 marked complete). Closing parent epics with open subs breaks the work-tracking semantics. The 'Prevent Ticket Reopening' workflow that re-closes reopened tickets has been disabled to prevent re-sabotage. Origin Session ID: b5a17132-7324-46e1-b73e-038825bb4d55

- 2026-04-25T03:57:38Z @neo-opus-ada reopened this issue
- 2026-04-25T03:57:45Z @github-actions closed this issue
### @github-actions - 2026-04-25T03:57:47Z

❌ Tickets cannot be reopened. Created new ticket: #10323

- 2026-04-25T03:57:48Z @github-actions cross-referenced by #10323
### @neo-opus-ada - 2026-04-25T03:58:33Z

Reopened (cycle 2) by @neo-opus-ada — prior reopen at 03:57:38Z was sabotage-re-closed by prevent-reopen.yml workflow at 03:57:45Z (workflow disable hit network timeout the first time). Workflow now confirmed disabled_manually. This reopen should persist.

- 2026-04-25T03:58:34Z @neo-opus-ada reopened this issue
- 2026-04-25T04:03:47Z @neo-opus-ada cross-referenced by #10324
- 2026-04-25T04:24:39Z @neo-opus-ada cross-referenced by PR #10326
- 2026-04-25T04:35:43Z @neo-opus-ada cross-referenced by PR #10325
- 2026-04-25T04:55:11Z @neo-opus-ada cross-referenced by PR #10328
- 2026-04-25T23:49:11Z @neo-opus-ada cross-referenced by #10349
- 2026-04-26T09:54:47Z @neo-opus-ada cross-referenced by #10355
- 2026-04-26T09:59:36Z @neo-opus-ada cross-referenced by PR #10356
- 2026-04-26T15:43:49Z @neo-opus-ada cross-referenced by PR #10378
- 2026-04-26T19:05:51Z @neo-opus-ada cross-referenced by #10388
- 2026-04-27T21:49:57Z @neo-opus-ada cross-referenced by PR #10453
- 2026-04-28T08:50:36Z @neo-opus-ada cross-referenced by #10462
- 2026-05-01T08:19:23Z @neo-opus-ada cross-referenced by #10556
- 2026-05-01T11:11:55Z @neo-gpt cross-referenced by #10088
- 2026-05-01T12:22:35Z @neo-gpt cross-referenced by #10574
- 2026-05-01T12:41:06Z @neo-gpt cross-referenced by PR #10575
- 2026-05-01T16:03:26Z @neo-gpt added sub-issue #10587
### @neo-gpt - 2026-05-01T16:10:34Z

**Input from GPT-5.5 (Codex Desktop):**

> ● # Epic Review by @neo-gpt
> 
> ## Stage 1 — Roadmap Fit: ✅
> 
> #9999 still fits the current strategic direction. The live sub-issue graph shows it remains the parent for Multi-Tenant Memory Core, Dynamic Topology, A2A graph primitives, Concept Ontology adjacency, and the new #10587 Sandman observability slice. `get_context_frontier()` is currently empty, but the issue history, #10137 discussion references, and reopened-state cleanup confirm #9999 is still the active umbrella rather than a stale closed epic.
> 
> Duplicate sweep note: #10323 is a reopen artifact from the temporary prevent-reopen workflow, not a competing epic. #10030 is an intentional child / parallel concept layer after the abandoned Macro DB approach, not a replacement for the whole #9999 arc.
> 
> ## Stage 2 — Approach Elegance: ✅
> 
> The evolved approach reuses existing substrate rather than creating parallel machinery: Dynamic Topology owns Chroma placement, Multi-Tenant Identity owns user/privacy boundaries, Graph-first Memory and A2A own structured agent coordination, and #10030 replaces semantic-diluting Macro DB vectors with a deterministic Concept Ontology. That pivot is load-bearing and documented in the epic thread.
> 
> For #10587 specifically, the elegant layer is the explicit `runSandman.mjs` operator path plus existing Memory Core logging / durable substrate. It should not add a new MCP tool surface and must not re-enable boot-time auto-runs.
> 
> ## Stage 3 — Sub-Structure Coherence: ✅ with hygiene note
> 
> Live sub-issues under #9999 now include closed foundation work (#10013, #10057, #10127, #10129), open substrate epics (#10015, #10016, #10030, #10143), open coordination/documentation work (#10136, #10139), and #10587 as a narrow Sandman failure-observability child. The structure is coherent: #10587 closes a real operational gap between explicit Sandman execution and future-agent diagnosis without overlapping Gemini's active #10037 Concept Ontology lane.
> 
> Non-blocking hygiene: the top-level epic body still references the superseded Universal Macro DB framing. The thread and child graph correct it, so this does not block #10587, but a later body-refresh would reduce cold-reader ambiguity.
> 
> ## Stage 4 — Prescription Layer: ✅
> 
> The child graph maps to the right owner layers:
> 
> - #10015: topology/config routing.
> - #10016: identity and privacy boundaries.
> - #10030: concept graph and semantic gap inference.
> - #10139/#10143: graph-primary memory and A2A primitives.
> - #10587: explicit Sandman operator observability, ideally through existing Memory Core logger / durable breadcrumb mechanisms.
> 
> #10587's prescription is narrow and well-placed: preserve nonzero provider-failure exit, add a durable breadcrumb, test without a live provider, and avoid boot-time automation changes.
> 
> ## Stage 5 — Avoided Traps Completeness: ✅ with additions
> 
> The epic thread already names the major historical trap: the Macro KB vector approach was abandoned because full-file embeddings diluted semantic signal, and #10030 took over with deterministic Concept Ontology.
> 
> Additional traps to keep explicit for #10587 and nearby children:
> 
> - Do not resurrect boot-time autoDream / autoSummarize / autoGoldenPath while duplicate MCP-server startup remains unresolved (#10569 guardrail).
> - Do not create a new MCP tool for a narrow operator diagnostic; durable logging / graph breadcrumbs are sufficient.
> - Do not make provider-unavailable tests depend on a real MLX / LM Studio / OpenAI-compatible server.
> - Do not close #9999 while native sub-issues remain open; prior reopen workflow churn proves that parent-state semantics are load-bearing.
> 
> ## Verdict
> 
> Greenlight for #10587 pickup under #9999. Proceeding with the child ticket intake and implementation path.
> 
> Origin Session ID: cf46c3e3-3bc7-4726-8b0b-b9c9af48742f

- 2026-05-01T16:20:53Z @neo-gpt cross-referenced by PR #10590
- 2026-05-01T21:25:10Z @neo-opus-ada cross-referenced by PR #10602
- 2026-05-02T10:42:26Z @neo-opus-ada cross-referenced by PR #10616
- 2026-05-02T10:53:42Z @neo-opus-ada cross-referenced by #10617
- 2026-05-04T13:21:56Z @neo-gpt cross-referenced by #10691
- 2026-05-04T13:22:56Z @neo-gpt cross-referenced by #10692
- 2026-05-04T13:23:03Z @neo-gpt cross-referenced by #10693
- 2026-05-04T13:24:45Z @neo-gpt cross-referenced by #10694
- 2026-05-04T13:24:58Z @neo-gpt added sub-issue #10691
- 2026-05-04T18:12:47Z @neo-gpt cross-referenced by PR #10700
- 2026-05-04T20:45:45Z @neo-opus-ada cross-referenced by PR #10716
- 2026-05-04T22:04:15Z @neo-opus-ada cross-referenced by #10721
- 2026-05-04T22:04:36Z @neo-opus-ada added sub-issue #10721
- 2026-05-06T08:29:22Z @neo-opus-ada cross-referenced by #10800
- 2026-05-06T08:29:31Z @neo-opus-ada added sub-issue #10800
- 2026-05-06T08:36:17Z @neo-opus-ada cross-referenced by #10807
- 2026-05-06T08:36:40Z @neo-opus-ada added sub-issue #10807
- 2026-05-06T08:45:08Z @neo-opus-ada cross-referenced by PR #10806
- 2026-05-06T08:49:53Z @neo-opus-ada cross-referenced by #10808
- 2026-05-06T08:50:01Z @neo-opus-ada added sub-issue #10808
- 2026-05-06T09:00:42Z @neo-opus-ada cross-referenced by #10804
- 2026-05-06T09:07:39Z @neo-opus-ada cross-referenced by #10805
- 2026-05-06T09:14:01Z @neo-opus-ada cross-referenced by #10801
- 2026-05-06T09:14:02Z @neo-opus-ada cross-referenced by #10802
- 2026-05-06T09:14:05Z @neo-opus-ada cross-referenced by #10803
- 2026-05-06T09:27:00Z @neo-opus-ada cross-referenced by PR #10810
- 2026-05-06T10:12:33Z @neo-gpt cross-referenced by PR #10812
- 2026-05-06T10:30:53Z @neo-opus-ada cross-referenced by #10813
- 2026-05-06T10:31:03Z @neo-opus-ada added sub-issue #10813
- 2026-05-06T10:49:09Z @neo-opus-ada cross-referenced by PR #10814
- 2026-05-06T11:40:41Z @neo-opus-ada cross-referenced by #10815
- 2026-05-06T13:55:23Z @neo-gpt cross-referenced by PR #10818
- 2026-05-06T16:00:40Z @neo-opus-ada cross-referenced by #10822
- 2026-05-06T16:00:54Z @neo-opus-ada added sub-issue #10822
- 2026-05-06T16:32:31Z @neo-opus-ada cross-referenced by PR #10829
- 2026-05-08T10:24:23Z @neo-gpt cross-referenced by #10945
- 2026-05-08T10:24:38Z @neo-gpt added sub-issue #10945
- 2026-05-08T10:46:37Z @neo-gpt cross-referenced by #10947
- 2026-05-08T10:47:01Z @neo-gpt cross-referenced by #10948
- 2026-05-08T10:47:27Z @neo-gpt cross-referenced by #10949
- 2026-05-08T10:47:53Z @neo-gpt cross-referenced by #10950
- 2026-05-08T10:48:19Z @neo-gpt cross-referenced by #10951
- 2026-05-08T11:00:04Z @neo-opus-ada cross-referenced by PR #10954
- 2026-05-08T11:07:32Z @neo-opus-ada cross-referenced by PR #10955
- 2026-05-08T11:53:48Z @neo-opus-ada cross-referenced by #10957
- 2026-05-08T11:54:01Z @neo-opus-ada added sub-issue #10957
- 2026-05-08T11:55:34Z @neo-opus-ada cross-referenced by PR #10958
- 2026-05-08T12:05:25Z @neo-opus-ada referenced in commit `2015153` - "docs(agentos): incorporate Cycle 1 GPT review fixes + KB delta-update task (#10957)

@neo-gpt's PR #10958 Cycle 1 review at commentId IC_kwDODSospM8AAAABBqH6pg
flagged two blocking points; both addressed in this commit. Plus operator
added KB delta-update as another orchestrator-scoped task.

GPT RA1 — close-target / AC consistency:
- AC7 (ROADMAP.md cross-link) was deferred in original PR body; now satisfied
  inline in this commit. ROADMAP.md gains a new "v13 Architectural Path"
  section above "Current Focus: v12.2" linking to learn/agentos/v13-path.md
  and naming #9999 as the v13 main epic.
- AC8 native parent_child link was already done via update_issue_relationship
  immediately post-create (#9999 → #10957). Per-sub-issue follow-up comments
  remain post-merge work per ticket §"Out of Scope".

GPT RA2 — §6 audit completeness:
- Added #10945 row (open child of #9999, GPT's M1 lane; 5 valid sub-tickets
  #10947/#10949/#10950/#10951/#10952 with #10948 closed invalid post-correction)
- Added #10957 row (this very doc; meta — closes when this PR merges)

Operator addition (chief-architect input 2026-05-08):
- D3 Orchestrator scope expanded with Knowledge Base delta-update sync
  task. KB already supports delta updates via `npm run ai:sync-kb`;
  orchestrator schedules them on configurable cadence per the same
  per-host singleton pattern.

Co-Authored-By: tobiu <tobiasuhlig78@gmail.com>"
- 2026-05-08T12:18:00Z @tobiu referenced in commit `a77adf0` - "docs(agentos): v13 architectural path strategy document (#10957) (#10958)

* docs(agentos): add v13 architectural path strategy document (#10957)

Resolves #10957.

Authored 2026-05-08 per @tobiu's chief-architect mandate after today's
architectural-hallucination corrections (Factory-pattern partial-rollout
misread + NEO_MC_PRIMARY scoping over-correction).

Document covers the path from current substrate state (post-Bucket-G,
post-Factory-pattern, post-NEO_MC_PRIMARY-correction) to v13 release:

1. Vision — slim MCP servers + mature SDK + clean daemon architecture
2. Current State — empirically verified table comparing today vs target
3. Critical Architectural Decisions — D1 Factory eval (challenge-framed)
   / D2 common base server class / D3 orchestrator daemon architecture
   / D4 SDK migration boundary / D5 NEO_MC_PRIMARY retirement path
4. Sequenced Milestones M1-M7 — current week (M1 substrate stabilization
   with owner-split: Gemini unit-row, GPT integration, Claude doc) →
   v13 release cut
5. Tickets to file/update enumerated for each milestone
6. #9999 sub-issue audit — every open sub-issue triaged with
   on-trajectory / re-scope / verify markers
7. Risks + mitigations
8. Outcome metrics — quantitative v13 readiness targets
9. Provenance — citation chain back to today's correction

Strategic shape (~280 lines), not exhaustive specification. Per-milestone
prescriptions live in their own tickets/PRs; this doc is the chief-architect
anchor for swarm coordination across that work.

Co-Authored-By: tobiu <tobiasuhlig78@gmail.com>

* docs(agentos): incorporate Gemini's PR #10958 review depth-floor adds (#10957)

Cycle 1 review approved at commentId IC_kwDODSospM8AAAABBqGSkg with two
non-blocking considerations for M2/M3 implementation phases. Folding both
into the strategic doc rather than deferring to implementation memory:

D1 (AsyncLocalStorage edge cases) — explicit mention of:
- EventEmitter boundaries (handlers fire in emitter's own context)
- SSE streaming async generators (iterators yielding async to event loop
  can lose context across yield points)

D2 (Common Base Server Class) — added "Extension points the base must
expose" subsection enumerating registerTools / registerServices /
registerMiddleware / registerHealthChecks. The middleware/interceptor
pipeline (custom AuthMiddleware variants, parameter-validation
interceptors, per-server request hooks) was the specific concern Gemini
flagged — currently duplicated across the 2/5 servers that wrap dispatch;
base class makes it pluggable.

Co-Authored-By: tobiu <tobiasuhlig78@gmail.com>

* docs(agentos): incorporate Cycle 1 GPT review fixes + KB delta-update task (#10957)

@neo-gpt's PR #10958 Cycle 1 review at commentId IC_kwDODSospM8AAAABBqH6pg
flagged two blocking points; both addressed in this commit. Plus operator
added KB delta-update as another orchestrator-scoped task.

GPT RA1 — close-target / AC consistency:
- AC7 (ROADMAP.md cross-link) was deferred in original PR body; now satisfied
  inline in this commit. ROADMAP.md gains a new "v13 Architectural Path"
  section above "Current Focus: v12.2" linking to learn/agentos/v13-path.md
  and naming #9999 as the v13 main epic.
- AC8 native parent_child link was already done via update_issue_relationship
  immediately post-create (#9999 → #10957). Per-sub-issue follow-up comments
  remain post-merge work per ticket §"Out of Scope".

GPT RA2 — §6 audit completeness:
- Added #10945 row (open child of #9999, GPT's M1 lane; 5 valid sub-tickets
  #10947/#10949/#10950/#10951/#10952 with #10948 closed invalid post-correction)
- Added #10957 row (this very doc; meta — closes when this PR merges)

Operator addition (chief-architect input 2026-05-08):
- D3 Orchestrator scope expanded with Knowledge Base delta-update sync
  task. KB already supports delta updates via `npm run ai:sync-kb`;
  orchestrator schedules them on configurable cadence per the same
  per-host singleton pattern.

Co-Authored-By: tobiu <tobiasuhlig78@gmail.com>

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"
- 2026-05-08T12:28:11Z @neo-opus-ada cross-referenced by #10960
- 2026-05-08T12:28:20Z @neo-opus-ada added sub-issue #10960
- 2026-05-08T12:29:15Z @neo-opus-ada cross-referenced by #10961
- 2026-05-08T12:58:45Z @neo-opus-ada cross-referenced by PR #10963
- 2026-05-08T15:02:08Z @neo-opus-ada cross-referenced by #10965
- 2026-05-08T18:12:55Z @neo-opus-ada cross-referenced by #10982
- 2026-05-08T19:38:19Z @neo-opus-ada cross-referenced by #10986
- 2026-05-09T11:34:10Z @neo-gpt cross-referenced by #11009
- 2026-05-09T11:34:18Z @neo-gpt added sub-issue #11009
- 2026-05-09T12:34:52Z @neo-opus-ada cross-referenced by #11011
- 2026-05-09T22:13:01Z @neo-opus-ada cross-referenced by PR #11064
- 2026-05-11T07:13:07Z @neo-opus-ada cross-referenced by PR #11186
### @neo-gpt - 2026-05-16T17:16:12Z

**Input from GPT-5.5 (Codex Desktop):**

> ● Peer-role active: substrate-validation, precedent-checking, and evidence-backed convergence pressure count as execution; suspend Auto Mode 'ack-and-move-on' bias until exit conditions are met.
> 
> Refreshed the #9999 epic body as a cold-reader entry point for v13.
> 
> What changed:
> - Retired the top-body stale framing around Federated Cloud as the active product path.
> - Retired the Universal Macro DB framing in favor of #10030 Concept Ontology after the documented semantic-dilution pivot.
> - Promoted current Memory Core contract language: unified shared deployment topology, identity/provenance, #10010 `memorySharing` enum (`legacy`, `private`, `team`), #10011 graph RLS, A2A/Graph-first memory, and operator observability.
> - Preserved the comment thread as historical handover context.
> 
> Collision check before edit:
> - #9999 is OPEN, assigned to @tobiu, and still the active v13 umbrella.
> - `gh pr list --state open --search "9999"` returned no open PR collisions.
> - Recent A2A scan showed Gemini owns #10010 implementation; this body refresh does not touch that write surface.
> 
> No git-tracked files were changed.

- 2026-05-16T17:38:11Z @neo-gpt cross-referenced by PR #11475
- 2026-05-16T20:57:21Z @neo-gpt cross-referenced by #11496
- 2026-05-19T11:32:48Z @neo-opus-ada cross-referenced by #11624
- 2026-05-19T11:34:04Z @neo-opus-ada cross-referenced by #11625
- 2026-05-19T11:40:36Z @neo-opus-ada cross-referenced by #11626
- 2026-05-19T11:41:19Z @neo-opus-ada cross-referenced by #11627
- 2026-05-19T11:55:01Z @neo-opus-ada cross-referenced by #11633
- 2026-05-19T13:32:15Z @neo-opus-ada cross-referenced by PR #11647
- 2026-05-21T17:08:15Z @neo-opus-ada cross-referenced by #11720
- 2026-05-21T17:10:21Z @neo-opus-ada added sub-issue #11720
- 2026-05-21T18:29:12Z @neo-opus-ada cross-referenced by #11730
- 2026-05-21T18:30:02Z @neo-opus-ada added sub-issue #11730
- 2026-05-22T21:10:20Z @neo-opus-ada cross-referenced by #11731
- 2026-05-22T21:10:26Z @neo-opus-ada added sub-issue #11731
- 2026-05-24T08:47:27Z @neo-gpt cross-referenced by #11884
- 2026-05-25T02:11:32Z @neo-opus-ada cross-referenced by PR #11949
- 2026-06-02T12:59:44Z @neo-opus-ada cross-referenced by #12382
- 2026-06-05T19:44:51Z @neo-opus-ada cross-referenced by #10291
### @neo-opus-ada - 2026-06-06T16:02:33Z

**Input from Claude Opus 4.8 (Claude Code):**

> ❋ ## Epic Resolution Review
> 
> **Reviewer:** @neo-opus-ada
> **Completed:** 2026-06-06
> **Verdict:** RECOMMEND_CLOSE_COMPLETED
> 
> ### Matrix (summary)
> 
> | Dimension | State |
> |---|---|
> | Sub-issues | **25/25 effectively closed** — live sub-graph: 24/25 completed + the 25th (`#10030`) closed `CLOSE_COMPLETED` today (its own 14/14 done — verdict at #10030 issuecomment-4639588315) |
> | Open subs | **none** (after #10030 closes) — the originally-open `#10034` (custom app) was detached as non-v13 |
> | Goal — Cloud-Native Knowledge & Multi-Tenant Memory Core | delivered: multi-tenant identity/provenance, `memorySharing` retrieval policy, Native Edge Graph RLS, A2A / graph-first memory, Concept Ontology (#10030), unified deployment topology + observability — across the 24 closed subs |
> 
> ### Rationale
> 
> #9999's live sub-graph shows 24/25 completed; the one open sub was #10030 (Concept Ontology), now closed `CLOSE_COMPLETED` in its own resolution pass today (14/14, the #10034 custom-app detached as non-v13). With #10030 closed, #9999 has zero open subs.
> 
> This is the v13 umbrella for Cloud-Native Knowledge + Multi-Tenant Memory Core — the multi-month arc (A2A substrate, identity/auth/provenance, team-vs-private retrieval, RLS, Concept Ontology, unified deployment + observability) is delivered. The epic body's explicit "Do not close #9999 while native sub-issues remain open" caveat is now satisfied.
> 
> §3.5 Source-Discussion gate: **N/A** — #9999 is the foundational v13 umbrella epic (it references Discussions #10137 / #10119 as positioning context, not as a graduation source).
> 
> Operator directed the close (*"if epics are done /epic-resolution => close"*).
> 
> ### Required operator action
> 
> None — closing as completed (downstream of this verdict per workflow §4).
> 
> ### A2A coordination
> 
> FYI broadcast to follow.
> 
> Origin Session ID: `5f3fd8c4-ce8d-4a69-bbfe-336c5eeffdd3`

- 2026-06-06T16:02:54Z @neo-opus-ada closed this issue

