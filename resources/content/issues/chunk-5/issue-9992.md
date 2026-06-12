---
id: 9992
title: Refactor Test Gap Detection Logic in DreamService
state: CLOSED
labels:
  - bug
  - ai
  - needs-re-triage
assignees: []
createdAt: '2026-04-14T08:19:14Z'
updatedAt: '2026-06-06T21:37:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9992'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-06T21:37:34Z'
---
# Refactor Test Gap Detection Logic in DreamService

### Description
The current test gap detection in `DreamService.mjs` attempts to map files/classes to tests via simple string path scanning (`testFilePaths.some(p => ...)`). This approach is utterly flawed and generates inaccurate test constraint alerts.

### Objective
- Develop a deterministic mechanism to accurately correlate source classes with their specific Playwright/validation test files.
- Replace the rudimentary path token scanning with a robust codebase parsing strategy or direct test manifest alignment.

## Timeline

- 2026-04-14T08:19:15Z @tobiu added the `bug` label
- 2026-04-14T08:19:15Z @tobiu added the `ai` label
### @neo-gpt - 2026-06-06T21:37:13Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Ticket-intake freshness classification
> 
> [ARCH_ALIGNMENT]
> 
> Verdict: **already resolved by successor work**. #9992 should not stay open as an implementation lane because its premise no longer matches current source.
> 
> V-B-A evidence checked before mutating the ticket:
> 
> - #9992 names `DreamService` path-scanning via `testFilePaths.some(...)`. Current source has no `testFilePaths` implementation in the AI services path, and `DreamService` now delegates session-scoped TEST_GAP inference to `GapInferenceEngine` at `ai/daemons/orchestrator/services/DreamService.mjs:811`.
> - Current `GapInferenceEngine` implements deterministic structural-node matching from graph `FILE` nodes whose `properties.path` starts with `test/`, requires all semantic structural-name tokens before accepting evidence, and writes `FILE -> VALIDATES -> CLASS/METHOD/COMPONENT` edges with evidence metadata.
> - PR #12638 (merged 2026-06-06) resolved #9906 and introduced the durable `VALIDATES` relation plus TEST_GAP suppression for matching test evidence.
> - PR #12643 (merged 2026-06-06) resolved #12639 and tightened the matching predicate so sibling token matches do not create false `VALIDATES` edges.
> - `test/playwright/unit/ai/daemons/orchestrator/services/DreamService.spec.mjs` now covers both positive `VALIDATES` edge creation (#9906) and sibling false-positive rejection (#12639).
> 
> Triage disposition: applying `needs-re-triage` per `ticket-triage` halt-path semantics, then closing this issue as completed by the merged successor PRs. If future work wants a manifest-backed test-evidence contract instead of graph `FILE` evidence, that should be a new ticket with a current Contract Ledger rather than this stale DreamService/path-scanning body.

- 2026-06-06T21:37:27Z @neo-gpt added the `needs-re-triage` label
- 2026-06-06T21:37:34Z @neo-gpt closed this issue

