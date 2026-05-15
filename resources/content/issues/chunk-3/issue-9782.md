---
id: 9782
title: Neural Link Playwright SDK Integration
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-08T09:44:11Z'
updatedAt: '2026-04-08T10:16:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9782'
author: tobiu
commentsCount: 0
parentIssue: 8851
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:16:34Z'
---
# Neural Link Playwright SDK Integration

### Goal
To support running Neural Link tests autonomously via Playwright, we need the `ConnectionService` and `Bridge` to seamlessly track identities. Since Playwright can spawn multiple parallel workers, we need testing environments to be uniquely identifiable and matchable to the browser context they spawn.

### Tasks
- Add explicit logging/handling for `role=test` in `Bridge.mjs`.
- Enhance `ConnectionService.mjs` to establish connection wrappers (e.g. `waitForSession`) that can dynamically locate a specific `appWorkerId` corresponding to the test's runtime context.
- Ensure the standalone SDK mode in `ai/services.mjs` safely works in a Node test runner.

## Timeline

- 2026-04-08T09:44:24Z @tobiu assigned to @tobiu
- 2026-04-08T09:44:28Z @tobiu added the `enhancement` label
- 2026-04-08T09:44:28Z @tobiu added the `ai` label
- 2026-04-08T09:44:28Z @tobiu added the `testing` label
- 2026-04-08T09:44:32Z @tobiu added parent issue #8851
- 2026-04-08T10:04:39Z @tobiu referenced in commit `108fffc` - "feat: Neural Link Driven Playwright Integration (#8851)

Resolves #8851, #9782, #9783

- Updated Bridge and ConnectionService to track test clients and App Names.

- Created neuralLink test fixture exposing MCP state observation.

- Added end-to-end smoke test validating God Mode access."
- 2026-04-08T10:13:00Z @tobiu cross-referenced by PR #9788
- 2026-04-08T10:16:34Z @tobiu closed this issue

