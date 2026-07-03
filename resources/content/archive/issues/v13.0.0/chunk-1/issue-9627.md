---
id: 9627
title: 'Grid Multi-Body: Introduce `grid.View` and Flatten `grid.Body` DOM'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T08:19:53Z'
updatedAt: '2026-04-02T08:26:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9627'
author: tobiu
commentsCount: 1
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-02T08:26:49Z'
---
# Grid Multi-Body: Introduce `grid.View` and Flatten `grid.Body` DOM

The first phase of the unified scrolling orchestration. We will create the new `neo.grid.View` class to act as the primary vertical scroll container and body wrapper.
- Extract `bodyWrapper` logic from `GridContainer` into the new `neo.grid.View` class.
- Flatten the output of `neo.grid.Body`. Remove its redundant outer and inner wrapper VNodes so it outputs a single clean node.
- Ensure all relevant SCSS files are updated to reflect the new DOM tree layout and class names.

## Timeline

- 2026-04-02T08:19:53Z @tobiu assigned to @tobiu
- 2026-04-02T08:19:54Z @tobiu added the `enhancement` label
- 2026-04-02T08:19:54Z @tobiu added the `ai` label
- 2026-04-02T08:19:54Z @tobiu added the `grid` label
- 2026-04-02T08:20:04Z @tobiu added parent issue #9626
- 2026-04-02T08:26:31Z @tobiu referenced in commit `48e1f7e` - "feat: Introduce grid.View and flatten grid.Body DOM (#9627)"
### @tobiu - 2026-04-02T08:26:41Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Implemented in `48e1f7e9f`. `grid.View` is now the body wrapper for `GridContainer`, and `GridBody`'s internal redundant scrolling wrapper nodes have been flattened out.

- 2026-04-02T08:26:49Z @tobiu closed this issue

