---
id: 9515
title: '[Epic Sub] Value Banding styling conflicts with row selection'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-18T18:21:19Z'
updatedAt: '2026-03-18T18:25:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9515'
author: tobiu
commentsCount: 1
parentIssue: 9511
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T18:25:48Z'
---
# [Epic Sub] Value Banding styling conflicts with row selection

Follow-up sub-task for #9511.
Currently, the value banding CSS rules (`.neo-value-band-1`, `.neo-value-band-2`) defined in `resources/scss/src/grid/Body.scss` are applied at the `.neo-grid-cell` level. Because they appear later in the stylesheet than the `.neo-selected` row-level rules, they override the row selection background colors.

**Goal:**
Adjust the CSS selector specificity or nesting order in `resources/scss/src/grid/Body.scss` to ensure that row selection styles take precedence over value banding cell styles.

## Timeline

- 2026-03-18T18:21:21Z @tobiu added the `enhancement` label
- 2026-03-18T18:21:21Z @tobiu added the `design` label
- 2026-03-18T18:21:21Z @tobiu added the `ai` label
- 2026-03-18T18:21:21Z @tobiu added the `grid` label
- 2026-03-18T18:21:35Z @tobiu added parent issue #9511
- 2026-03-18T18:21:40Z @tobiu assigned to @tobiu
- 2026-03-18T18:24:16Z @tobiu referenced in commit `98f754b` - "style(grid): Ensure row selection styling takes precedence over value banding (#9515)"
### @tobiu - 2026-03-18T18:25:25Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented via `98f754bb9`

- 2026-03-18T18:25:48Z @tobiu closed this issue

