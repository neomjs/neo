---
id: 9572
title: 'Draft Release Notes: ScrollSync & Performance'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T10:39:45Z'
updatedAt: '2026-03-27T10:44:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9572'
author: tobiu
commentsCount: 1
parentIssue: 9569
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T10:44:36Z'
---
# Draft Release Notes: ScrollSync & Performance

Sub-task of Epic #9569.

This ticket tracks the drafting of the **ScrollSync & Performance** section for the v12.1 release notes.

**Scope:**
- `Neo.plugin.ScrollSync` loop-free 2-way binding upgrade.
- Optical pinning via Hybrid rAF Engine & CSS variables.
- O(1) Performance refactoring (eradicating O(N²) traversals in `syncVnodeTree`).
- Proxy Getter Hoisting to reduce GC pressure.

## Timeline

- 2026-03-27T10:39:46Z @tobiu added the `documentation` label
- 2026-03-27T10:39:46Z @tobiu added the `ai` label
- 2026-03-27T10:40:09Z @tobiu added parent issue #9569
- 2026-03-27T10:44:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-27T10:44:34Z

Drafted the section and pushed to the repository.

- 2026-03-27T10:44:36Z @tobiu closed this issue
- 2026-03-27T10:44:42Z @tobiu referenced in commit `705b159` - "docs: Draft v12.1.0 core sections (#9570) (#9571) (#9572) (#9573)"

