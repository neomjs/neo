---
id: 9753
title: 'Refactor: Move memory-core tests to accurate server path'
state: CLOSED
labels:
  - QA
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-04-07T12:54:44Z'
updatedAt: '2026-04-07T12:56:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9753'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T12:56:24Z'
---
# Refactor: Move memory-core tests to accurate server path

### Description
The `memory-core` Playwright test files (`DreamServiceGoldenPath.spec.mjs` and `SessionSummarization.spec.mjs`) are currently located in the incorrect `test/playwright/unit/ai/mcp/memory-core` directory.
Since they test the MCP Server logic and services, they must be housed in `test/playwright/unit/ai/mcp/server/memory-core/services`.
This ticket tracks moving these files via `git mv`, cleaning up the stale directory, and mapping their relative path offsets to be two directories deeper (`../../`).

## Timeline

- 2026-04-07T12:54:46Z @tobiu added the `QA` label
- 2026-04-07T12:54:46Z @tobiu added the `ai` label
- 2026-04-07T12:54:46Z @tobiu added the `refactoring` label
### @tobiu - 2026-04-07T12:56:13Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Successfully moved both test files to `test/playwright/unit/ai/mcp/server/memory-core/services/` using `git mv`.
> 
> Relative paths have been adjusted. For deeper standard roots (`src` and `setup.mjs`), paths were extended by `../../`. For local intra-service imports (e.g., `TextEmbeddingService.mjs` and `config.mjs`), the deep nested directories were simplified to local `./` resolution.
> 
> Changes have been syntax checked and pushed upstream. Closing issue.

- 2026-04-07T12:56:13Z @tobiu referenced in commit `e207209` - "test: move memory-core tests to proper server/ directory and fix imports (#9753)"
- 2026-04-07T12:56:22Z @tobiu assigned to @tobiu
- 2026-04-07T12:56:24Z @tobiu closed this issue
- 2026-04-07T12:58:03Z @tobiu cross-referenced by #9754

