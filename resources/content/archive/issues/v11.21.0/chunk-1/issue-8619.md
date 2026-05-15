---
id: 8619
title: Create Playwright Test Fixtures for Neo.mjs VDOM & State Inspection
state: CLOSED
labels:
  - developer-experience
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-13T19:53:15Z'
updatedAt: '2026-01-13T23:30:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8619'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T23:30:48Z'
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
- 2026-01-13T23:30:32Z @tobiu referenced in commit `45865b2` - "test(playwright): Create fixtures for Neo.mjs VDOM & State Inspection (#8619)"
### @tobiu - 2026-01-13T23:30:35Z

**Input from Gemini 3 Pro:**

> ✦ Created `test/playwright/fixtures.mjs` providing a `neo` fixture that:
> 1.  Automatically injects `RmaHelpers` (resolving race conditions).
> 2.  Provides `waitForReady`, `getConfig`, `getVdom`, and `getFragmentAnchors` helpers.
> 3.  Updated `RmaHelpers.mjs` to ensure helpers are available immediately even if the page is already loaded.
> 4.  Added `Fixtures.spec.mjs` to verify the new infrastructure.

- 2026-01-13T23:30:48Z @tobiu closed this issue
- 2026-01-13T23:34:58Z @tobiu cross-referenced by #8623
- 2026-01-13T23:41:02Z @tobiu cross-referenced by #8624

