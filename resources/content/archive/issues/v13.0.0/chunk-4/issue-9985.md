---
id: 9985
title: 'docs: add "The Dream Pipeline & Golden Path" guide'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T18:51:03Z'
updatedAt: '2026-04-13T22:31:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9985'
author: tobiu
commentsCount: 0
parentIssue: 9981
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T19:03:45Z'
---
# docs: add "The Dream Pipeline & Golden Path" guide

## Context

The [Architecture Overview](../learn/benefits/ArchitectureOverview.md) covers the DreamService REM pipeline's 6 phases at a structural level. The [Swarm Intelligence](../learn/agentos/SwarmIntelligence.md) guide covers the Orchestrator *consuming* Golden Path output. Neither guide explains the **forecasting philosophy** — how the system decides what to work on, why, and in what order.

The Golden Path concept is philosophically rich (Dune's prescient optimization, Foundation's psychohistory, Westworld S3's Rehoboam). It deserves dedicated coverage.

## Proposed Guide: `learn/agentos/DreamPipeline.md`

### Content Scope

1. **The REM Pipeline End-to-End** — All 6 phases from session digestion through Golden Path synthesis, explained in depth (not the abbreviated Architecture Overview version)
2. **Tri-Vector Scoring** — How `DreamService` extracts and weights capability gaps, blocking relationships, and failure frequencies to score each ticket
3. **Hebbian Decay** — How stale or abandoned nodes naturally lose priority weight over time
4. **Topological Conflict Detection** — How the graph identifies contradictory or redundant initiatives
5. **Golden Path Synthesis (Phase 5)** — The forecasting algorithm that produces `sandman_handoff.md`
6. **The Philosophy** — Why the system predicts its own optimal evolution trajectory. The closed feedback loop: completed tasks change the graph → graph changes future predictions
7. **`sandman_handoff.md` Format** — The strategic dashboard contract between DreamService and Orchestrator

### Source Files
- `ai/daemons/DreamService.mjs` — The REM pipeline implementation
- `ai/agent/Orchestrator.mjs` — Golden Path consumer
- `resources/content/sandman_handoff.md` — The handoff document

### Registration
- Add to `learn/tree.json` under Agent OS
- Cross-link from Architecture Overview (Phase 5 section)
- Cross-link from Swarm Intelligence (Orchestrator Pipeline section)

## Acceptance Criteria
- [ ] Guide created at `learn/agentos/DreamPipeline.md`
- [ ] Registered in `tree.json`
- [ ] Cross-linked from Architecture Overview and Swarm Intelligence
- [ ] CodebaseOverview cross-reference updated

## A2A Context
- **Parent:** #9981 (Architecture formalization epic)
- **Sibling:** #9983 (Swarm Intelligence — completed, PR #9984)
- **Origin Session:** `70334eab-72c9-44a6-8f48-0b6a96604f49`

## Timeline

- 2026-04-13T18:51:04Z @tobiu added the `documentation` label
- 2026-04-13T18:51:05Z @tobiu added the `enhancement` label
- 2026-04-13T18:51:05Z @tobiu added the `ai` label
- 2026-04-13T18:51:14Z @tobiu added parent issue #9981
- 2026-04-13T18:56:30Z @tobiu referenced in commit `e620c9e` - "docs: add 'The Dream Pipeline & Golden Path' guide (#9985)"
- 2026-04-13T18:56:55Z @tobiu cross-referenced by PR #9987
- 2026-04-13T19:01:33Z @tobiu referenced in commit `d09dc55` - "chore: address review feedback — add Running section, restructure CodebaseOverview blockquote (#9985)"
- 2026-04-13T19:03:45Z @tobiu referenced in commit `d0296e1` - "docs: add 'The Dream Pipeline & Golden Path' guide (#9985) (#9987)

* docs: add 'The Dream Pipeline & Golden Path' guide (#9985)

* chore: address review feedback — add Running section, restructure CodebaseOverview blockquote (#9985)"
- 2026-04-13T19:03:45Z @tobiu closed this issue
- 2026-04-13T22:31:34Z @tobiu assigned to @tobiu

