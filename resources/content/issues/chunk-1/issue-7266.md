---
id: 7266
title: Explore and Implement Test File Indexing in Knowledge Base
state: CLOSED
labels:
  - enhancement
  - no auto close
  - ai
assignees:
  - tobiu
createdAt: '2025-09-27T12:05:31Z'
updatedAt: '2026-06-23T03:59:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7266'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-23T03:59:49Z'
---
# Explore and Implement Test File Indexing in Knowledge Base

Once all unit tests have been migrated to the Playwright runner, their value as documentation can be amplified by making them searchable. This task is to explore the best method for including the Playwright test files (`*.spec.mjs`) in the ChromaDB knowledge base and to implement the chosen solution.

## Acceptance Criteria

1.  Investigate the `ai:build-kb` script to determine how to include `.spec.mjs` files.
2.  Modify the script and any related configuration to add the test files to the knowledge base.
3.  Verify that queries made via `npm run ai:query` can successfully return results from within the test files.

## Timeline

- 2025-09-27T12:05:33Z @tobiu added the `enhancement` label
- 2025-09-27T12:05:33Z @tobiu added parent issue #7262
- 2025-09-27T12:34:13Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-04T10:55:51Z

detaching the ticket from the epic.

- 2025-11-04T10:56:04Z @tobiu added the `no auto close` label
- 2025-11-04T10:56:04Z @tobiu added the `ai` label
- 2025-11-04T10:56:16Z @tobiu removed parent issue #7262
### @neo-gpt - 2026-06-23T03:59:39Z

[COMPLETED_BY_SUCCESSOR] Maintenance verification on 2026-06-23: this ticket’s acceptance criteria are now satisfied by the closed #7897 implementation and the current Knowledge Base substrate.

Evidence checked before closing:

- #7897 is closed and records the direct implementation: `test/playwright/` indexed as raw source with content type `test`, `query_documents`/KB type enum updated, and verification that `type: 'test'` returns Playwright specs.
- Current source has `ai/services/knowledge-base/source/TestSource.mjs`, which recursively scans `aiConfig.sourcePaths.TestSource` and indexes Playwright `.mjs` files as `type: 'test'`, with granular chunks via `TestParser`.
- `ai/mcp/server/knowledge-base/config.mjs` sets `TestSource: 'test/playwright'` and includes `test` in the secondary query candidate pool.
- `ai/mcp/server/knowledge-base/openapi.yaml` includes `test` in the `ask_knowledge_base` / `query_documents` type enum.
- Live KB checks with `query_documents(..., type: 'test')` returned current Playwright spec paths, including `test/playwright/unit/grid/ViewOwnedSelectionModel.spec.mjs` and `test/playwright/unit/draggable/dashboard/SortZone.spec.mjs`.

Closing as completed/superseded-by-implementation rather than routing this into another implementation pass.

- 2026-06-23T03:59:50Z @neo-gpt closed this issue

