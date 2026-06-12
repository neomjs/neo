---
id: 8337
title: 'Fix Playwright Timing: Wait for Neo.worker.App in Chip.spec.mjs'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees: []
createdAt: '2026-01-05T19:14:54Z'
updatedAt: '2026-01-05T19:40:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8337'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T19:40:20Z'
---
# Fix Playwright Timing: Wait for Neo.worker.App in Chip.spec.mjs

The Playwright component tests are failing with `TypeError: Cannot read properties of undefined (reading 'createNeoInstance')`.
This occurs because the test script executes `Neo.worker.App.createNeoInstance` inside `page.evaluate` before the App worker has successfully registered its remote methods in the main thread.

**Root Cause:**
Race condition between the test script execution and the Neo.mjs worker initialization / remote method registration.

**Fix:**
Update the test `beforeEach` block to explicitly wait for `Neo.worker.App` to be defined in the window context.

```javascript
await page.waitForFunction(() => window.Neo && window.Neo.worker && window.Neo.worker.App);
```

**Scope:**
Apply this fix to `test/playwright/component/list/Chip.spec.mjs` to verify the solution.


## Timeline

- 2026-01-05T19:14:56Z @tobiu added the `bug` label
- 2026-01-05T19:14:56Z @tobiu added the `ai` label
- 2026-01-05T19:14:56Z @tobiu added the `testing` label
### @tobiu - 2026-01-05T19:40:19Z

Closing as invalid. The root cause was identified as a regression in Neo.worker.Base.hasWorker (fixed in #8338), not a timing issue in the test itself.

- 2026-01-05T19:40:20Z @tobiu closed this issue

