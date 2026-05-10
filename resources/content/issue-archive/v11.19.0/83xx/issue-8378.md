---
id: 8378
title: Add intent-driven comments to Mermaid Addon
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2026-01-07T12:29:37Z'
updatedAt: '2026-01-07T12:37:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8378'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T12:37:24Z'
---
# Add intent-driven comments to Mermaid Addon

Add intent-driven comments to `src/main/addon/Mermaid.mjs`.

**Goal:**
- enhance documentation for the Mermaid Main thread addon.
- Explicitly mention the two primary consumers of this addon:
    1. `Neo.component.Markdown` (for rendering mermaid blocks in markdown).
    2. `Neo.component.wrapper.Mermaid` (the standalone wrapper component).

**Why:**
To improve codebase navigability and ensure developers understand where and how this addon is utilized.

## Timeline

- 2026-01-07T12:29:38Z @tobiu added the `documentation` label
- 2026-01-07T12:29:38Z @tobiu added the `enhancement` label
- 2026-01-07T12:36:44Z @tobiu assigned to @tobiu
- 2026-01-07T12:37:07Z @tobiu referenced in commit `744449a` - "Add intent-driven comments to Mermaid Addon #8378"
- 2026-01-07T12:37:24Z @tobiu closed this issue

