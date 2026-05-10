---
id: 7437
title: Create Empty Viewport App for Component Tests
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - Aki-07
createdAt: '2025-10-10T16:47:10Z'
updatedAt: '2025-10-13T10:13:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7437'
author: tobiu
commentsCount: 3
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-12T11:51:16Z'
---
# Create Empty Viewport App for Component Tests

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns: https://github.com/neomjs/neo/issues/7435

As part of the component test harness, a minimal Neo.mjs application is required to act as the host, or "empty viewport," for the dynamically created components under test.

## Acceptance Criteria

1.  Create a new, minimal application at `test/apps/component-test-app/app.mjs`.
2.  This application should consist of a single, empty `Neo.container.Viewport`.
3.  The application's `index.html` should be configured to load this app.
4.  The `webServer` in the Playwright config should point to this application's entry point.

## Timeline

- 2025-10-10T16:47:11Z @tobiu added the `enhancement` label
- 2025-10-10T16:47:12Z @tobiu added the `help wanted` label
- 2025-10-10T16:47:12Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:47:12Z @tobiu added the `ai` label
- 2025-10-10T16:47:12Z @tobiu added parent issue #7435
- 2025-10-11T05:15:19Z @Aki-07 cross-referenced by PR #7458
### @tobiu - 2025-10-11T11:52:48Z

@Aki-07: you need to add a quick comment here, otherwise i can not assign the ticket to you (github security policies).

### @Aki-07 - 2025-10-11T15:12:26Z

Can I get this issue assigned on me @tobiu 


- 2025-10-12T11:51:16Z @tobiu closed this issue
- 2025-10-13T10:13:00Z @tobiu assigned to @Aki-07
### @tobiu - 2025-10-13T10:13:48Z

missed the assignment, and added it now for clarity. nothing left to do here => resolved.


