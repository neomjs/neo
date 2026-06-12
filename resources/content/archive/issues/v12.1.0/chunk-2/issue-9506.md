---
id: 9506
title: Improve inline code styling within h1 tags in Markdown component
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-18T09:53:56Z'
updatedAt: '2026-03-18T09:55:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9506'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T09:55:55Z'
---
# Improve inline code styling within h1 tags in Markdown component

When using an inline code block inside an `h1` tag within the `Markdown` component for the first time, the default font size is too large (1em) and inherited styling is missing, making it visually overwhelming compared to the heading text.

This issue implements an enhancement to scale the code font size down to `.8em` and inherit `font-family` and `font-weight`, while preserving the theme's specific code block text color for contrast (similar to the existing `h2` and `h3` rules).

## Timeline

- 2026-03-18T09:53:58Z @tobiu added the `enhancement` label
- 2026-03-18T09:53:58Z @tobiu added the `ai` label
- 2026-03-18T09:54:29Z @tobiu referenced in commit `468bf02` - "style(Markdown): Add inline code styling within h1 tags (#9506)"
- 2026-03-18T09:54:57Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-18T09:55:54Z

Completed in 468bf024ca9b08b43036925c6c9290a192ce122c

- 2026-03-18T09:55:55Z @tobiu closed this issue

