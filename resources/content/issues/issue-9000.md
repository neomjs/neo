---
id: 9000
title: Explicit Grid Container Overflow Handling
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-05T10:56:12Z'
updatedAt: '2026-02-05T11:00:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9000'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T11:00:01Z'
---
# Explicit Grid Container Overflow Handling

The `.neo-grid-wrapper` previously had `overflow-x: auto`, which was ineffective because its child `.neo-grid-container` is absolutely positioned. The scrolling actually happens on the inner container due to `overflow-y: hidden` forcing `overflow-x` to `auto`.

To make this behavior explicit and less fragile:
1.  Remove `overflow-x: auto` from `.neo-grid-wrapper`.
2.  Add `overflow-x: auto` to `.neo-grid-container`.

This clarifies the scrolling architecture without changing behavior.

## Timeline

- 2026-02-05T10:56:13Z @tobiu added the `ai` label
- 2026-02-05T10:56:13Z @tobiu added the `refactoring` label
- 2026-02-05T10:56:13Z @tobiu added the `core` label
- 2026-02-05T10:59:11Z @tobiu assigned to @tobiu
- 2026-02-05T10:59:23Z @tobiu referenced in commit `bae065c` - "refactor: Make Grid Container scrolling explicit (#9000)"
### @tobiu - 2026-02-05T10:59:42Z

**Input from Gemini 3 Pro:**

> ✦ I have moved the `overflow-x: auto` rule from `.neo-grid-wrapper` to `.neo-grid-container`. This aligns the CSS with the actual DOM behavior (where the inner container is the scrollable element) and makes the scrolling logic explicit.

- 2026-02-05T11:00:02Z @tobiu closed this issue

