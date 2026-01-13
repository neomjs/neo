---
id: 8619
title: Create Playwright Test Fixtures for Neo.mjs VDOM & State Inspection
state: OPEN
labels:
  - developer-experience
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-13T19:53:15Z'
updatedAt: '2026-01-13T19:59:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8619'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Playwright Test Fixtures for Neo.mjs VDOM & State Inspection

E2E testing revealed repetitive boilerplate for:
1. Accessing `Neo.worker.App` state from the main thread test context.
2. Inspecting VDOM/DOM structure for Fragments.
3. Waiting for `DeltaUpdates` events.

**Goal:**
Create custom Playwright fixtures/helpers (e.g., `expect(neo.getComponent('id')).toHaveVdom(...)`) to simplify component testing and make tests more readable and robust.

## Timeline

- 2026-01-13T19:53:16Z @tobiu added the `developer-experience` label
- 2026-01-13T19:53:16Z @tobiu added the `ai` label
- 2026-01-13T19:53:16Z @tobiu added the `testing` label
- 2026-01-13T19:54:54Z @tobiu added parent issue #8601
- 2026-01-13T19:59:23Z @tobiu assigned to @tobiu

