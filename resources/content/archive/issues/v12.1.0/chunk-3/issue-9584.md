---
id: 9584
title: 'Bug: Data worker broadly bundles non-data framework classes (Main.mjs) causing Webpack build failure'
state: CLOSED
labels:
  - bug
  - ai
  - performance
  - build
assignees:
  - tobiu
createdAt: '2026-03-27T14:06:36Z'
updatedAt: '2026-03-27T14:18:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9584'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T14:18:05Z'
---
# Bug: Data worker broadly bundles non-data framework classes (Main.mjs) causing Webpack build failure

The `webpackInclude` regex for `Data.mjs` previously captured the entirety of the `src/` directory (`/(?:apps|docs\\/app|examples|src)\\/.*\\.mjs$/`). This massively bloated the Data worker's dynamic chunk map with thousands of UI components, main thread controllers, and build loaders.

When Webpack traversed the map and compiled `src/Main.mjs`, it crashed upon hitting the main-thread workspace addon resolution (`import('../../../src/main/addon/')`), throwing `Module not found: Error: Can't resolve '../../../src/main/addon'`. Additionally, it threw critical dependency warnings on `src/MicroLoader.mjs`. 

By restricting the framework source match in `Data.mjs` to exclusively target `src\\/data` instead of all of `src/`, we pruned thousands of invalid classes from the Data worker's chunk map, removing the compilation crashes and massively optimizing build performance.

## Timeline

- 2026-03-27T14:06:37Z @tobiu added the `bug` label
- 2026-03-27T14:06:37Z @tobiu added the `ai` label
- 2026-03-27T14:06:37Z @tobiu added the `performance` label
- 2026-03-27T14:06:38Z @tobiu added the `build` label
- 2026-03-27T14:16:42Z @tobiu referenced in commit `647a23a` - "fix(build): Remove global contextAdjusted from Webpack configs to allow robust dynamic imports (#9584)"
- 2026-03-27T14:16:44Z @tobiu assigned to @tobiu
- 2026-03-27T14:18:06Z @tobiu closed this issue

