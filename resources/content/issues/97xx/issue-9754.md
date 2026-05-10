---
id: 9754
title: 'Fix: Correct relative import paths for memory-core tests'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-07T12:58:02Z'
updatedAt: '2026-04-07T12:58:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9754'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T12:58:32Z'
---
# Fix: Correct relative import paths for memory-core tests

### Description
In #9753, the relative import paths for the source services were incorrectly minimized to `./` instead of traversing back to the project root (`../../../../../../../../ai/...`).
The test files are located in `test/playwright/...`, while the services are in `ai/...`. The paths must traverse back 8 levels to the project root before descending into the `ai` directory.
This ticket resolves the pathing failure for `TextEmbeddingService`, `DreamService`, `config.mjs`, etc.

## Timeline

- 2026-04-07T12:58:03Z @tobiu added the `bug` label
- 2026-04-07T12:58:03Z @tobiu added the `ai` label
- 2026-04-07T12:58:03Z @tobiu added the `testing` label
- 2026-04-07T12:58:30Z @tobiu referenced in commit `6e1cfb7` - "fix: correct relative import paths for memory-core tests (#9754)"
- 2026-04-07T12:58:31Z @tobiu assigned to @tobiu
- 2026-04-07T12:58:33Z @tobiu closed this issue

