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
updatedAt: '2026-04-16T18:44:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9999'
author: tobiu
commentsCount: 1
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
subIssuesCompleted: 3
subIssuesTotal: 9
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

