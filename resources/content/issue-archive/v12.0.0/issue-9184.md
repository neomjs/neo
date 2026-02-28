---
id: 9184
title: 'Optimize Component Columns with contain: strict'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-16T12:08:32Z'
updatedAt: '2026-02-16T12:11:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9184'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T12:11:23Z'
---
# Optimize Component Columns with contain: strict

To optimize grid scrolling performance, we can upgrade CSS containment for component-based columns from `contain: layout paint style` to `contain: strict`.
This allows the browser to completely skip layout and style recalculations for these components during scroll, treating them as rigid boxes.

**Targets:**
1.  **GitHubOrgs:** Add `width: 100%` and upgrade to `strict`.
2.  **Heuristics (Impact):** Add `width: 100%` and upgrade to `strict`.
3.  **CountryFlag:** Add `height: 100%` and upgrade to `strict`.

**Note:** `Sparkline` (Activity) already uses `contain: strict`. `IconLink` will remain as-is to preserve flexibility in non-grid contexts.

## Timeline

- 2026-02-16T12:08:34Z @tobiu added the `enhancement` label
- 2026-02-16T12:08:34Z @tobiu added the `ai` label
- 2026-02-16T12:08:34Z @tobiu added the `performance` label
- 2026-02-16T12:08:51Z @tobiu added parent issue #9106
- 2026-02-16T12:10:52Z @tobiu assigned to @tobiu
- 2026-02-16T12:11:00Z @tobiu referenced in commit `f6a7049` - "perf(css): Optimize component columns with contain: strict (#9184)"
- 2026-02-16T12:11:23Z @tobiu closed this issue

