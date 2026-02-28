---
id: 9276
title: Support infinite indentation levels in TreeList using CSS variables
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T22:53:29Z'
updatedAt: '2026-02-23T22:54:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9276'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T22:54:16Z'
---
# Support infinite indentation levels in TreeList using CSS variables

The portal and DevIndex learning sections introduced a folder depth of 4 for the tree list navigation. Previously, indentation levels were hardcoded in SCSS with nested selectors (e.g., `ul .neo-list-item`) which only supported up to 3 levels, making deeper structures appear unindented and breaking the visual hierarchy.

This ticket resolves the issue by replacing the brittle hardcoded SCSS with a dynamic CSS variable approach. The `TreeList` JavaScript now passes `--neo-tree-level` via inline styles. The four main SCSS themes define `--tree-list-indent-base` and `--tree-list-indent-step`, which are then used in a single `calc()` rule in the core SCSS to automatically calculate the correct indentation for any infinite depth level.

## Timeline

- 2026-02-23T22:53:30Z @tobiu added the `enhancement` label
- 2026-02-23T22:53:30Z @tobiu added the `design` label
- 2026-02-23T22:53:30Z @tobiu added the `ai` label
- 2026-02-23T22:53:38Z @tobiu assigned to @tobiu
- 2026-02-23T22:53:51Z @tobiu referenced in commit `2c31164` - "feat(tree): Support infinite indentation levels using CSS variables (#9276)"
### @tobiu - 2026-02-23T22:54:00Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the CSS variables for infinite depth indentation in the tree list. The changes have been pushed in commit `2c311643f`. I will now close this issue.

### @tobiu - 2026-02-23T22:54:16Z

Completed

- 2026-02-23T22:54:16Z @tobiu closed this issue

