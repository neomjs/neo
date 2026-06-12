---
id: 9783
title: Implement NeuralLink Playwright Test Fixture
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-08T09:44:12Z'
updatedAt: '2026-04-08T10:16:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9783'
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
# Implement NeuralLink Playwright Test Fixture

### Goal
Implement a first-class `neuralLink` test fixture into the Playwright framework context to provide "God Mode" capabilities during standard E2E testing workflows.

### Tasks
- Import the Neural Link SDK within `test/playwright/fixtures.mjs`.
- Provide an initialized `neuralLink` fixture utilizing Playwright context variables.
- Expose a `connectToApp()` helper that bridges Playwright's DOM inspection (`window.Neo.workerId`) with the Neural Link connection layer to seamlessly connect to the correct isolated app instance.

## Timeline

- 2026-04-08T09:44:26Z @tobiu assigned to @tobiu
- 2026-04-08T09:44:29Z @tobiu added the `enhancement` label
- 2026-04-08T09:44:30Z @tobiu added the `ai` label
- 2026-04-08T09:44:30Z @tobiu added the `testing` label
- 2026-04-08T09:44:33Z @tobiu added parent issue #8851
- 2026-04-08T10:04:40Z @tobiu referenced in commit `108fffc` - "feat: Neural Link Driven Playwright Integration (#8851)

Resolves #8851, #9782, #9783

- Updated Bridge and ConnectionService to track test clients and App Names.

- Created neuralLink test fixture exposing MCP state observation.

- Added end-to-end smoke test validating God Mode access."
- 2026-04-08T10:13:00Z @tobiu cross-referenced by PR #9788
- 2026-04-08T10:16:34Z @tobiu closed this issue

