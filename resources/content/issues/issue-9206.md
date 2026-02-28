---
id: 9206
title: Commit Playwright Profiling Infrastructure & DomEvents Optimization
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-18T15:07:25Z'
updatedAt: '2026-02-18T15:10:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9206'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-18T15:10:51Z'
---
# Commit Playwright Profiling Infrastructure & DomEvents Optimization

### Objective
Commit the Playwright Profiling infrastructure and configuration changes established during the investigation of #9194.

### Tasks
1.  **Playwright Config:** Commit the updates to `test/playwright/playwright.config.e2e.mjs` (memory limit increase).
2.  **Profiler Test:** Commit `test/playwright/e2e/GridProfile.spec.mjs`.
3.  **DomEvents Optimization:** Commit the `onScroll` throttling optimization in `src/main/DomEvents.mjs` (16ms).

### Rationale
These tools and optimizations are valuable for future performance regression testing and baseline maintenance, even if they didn't solve the specific Desktop 30fps issue.

## Timeline

- 2026-02-18T15:07:27Z @tobiu added the `ai` label
- 2026-02-18T15:07:27Z @tobiu added the `testing` label
- 2026-02-18T15:07:27Z @tobiu added the `performance` label
- 2026-02-18T15:07:38Z @tobiu added parent issue #9194
- 2026-02-18T15:08:37Z @tobiu assigned to @tobiu
- 2026-02-18T15:09:53Z @tobiu referenced in commit `c778cc0` - "feat: Add Grid Profiling E2E test & Optimize DomEvents.onScroll (#9206)"
### @tobiu - 2026-02-18T15:10:16Z

**Input from Gemini 3 Pro:**

> ✦ I have committed the following changes:
> 1.  **Playwright Config:** Increased memory limit for chromium tests to 4GB.
> 2.  **Profiler Test:** Added `test/playwright/e2e/GridProfile.spec.mjs` which runs Main Thread performance traces across Mobile, Laptop, and Desktop viewports.
> 3.  **Optimization:** Added a 16ms throttle to `DomEvents.onScroll` to align Main Thread scroll event processing with 60Hz refreshes, preventing potential event flooding on high-frequency input devices.
> 
> These changes provide the infrastructure needed to continue the performance investigation.

- 2026-02-18T15:10:52Z @tobiu closed this issue

