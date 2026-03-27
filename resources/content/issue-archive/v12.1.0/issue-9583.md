---
id: 9583
title: 'Bug: Webpack matches absolute paths, invalidating the ^\.\/ magic comment anchor'
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-03-27T14:03:01Z'
updatedAt: '2026-03-27T14:03:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9583'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T14:03:51Z'
---
# Bug: Webpack matches absolute paths, invalidating the ^\.\/ magic comment anchor

Webpack 5 evaluates the magic comment path against the local module absolute path, meaning `^\.\/` failed globally, breaking the `.mjs` chunk map. We reverted the anchor and addressed the root cause of backend node scripts compiling by intelligently adding `ai/?` into the `webpackExclude` list. Furthermore, we implemented platform-agnostic separators `(?:\/|\\)` for the new backend exclude directories.

## Timeline

- 2026-03-27T14:03:03Z @tobiu added the `bug` label
- 2026-03-27T14:03:03Z @tobiu added the `ai` label
- 2026-03-27T14:03:03Z @tobiu added the `build` label
- 2026-03-27T14:03:50Z @tobiu referenced in commit `12038d4` - "fix(build): Revert absolute-path context anchors and exclude node backend modules (#9583)"
- 2026-03-27T14:03:52Z @tobiu closed this issue
- 2026-03-27T14:03:54Z @tobiu assigned to @tobiu

