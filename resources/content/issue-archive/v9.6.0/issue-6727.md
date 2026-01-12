---
id: 6727
title: 'buildScripts/buildThemes: mode all => combine dist/esm & dist/prod'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-29T09:50:32Z'
updatedAt: '2025-06-01T09:05:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6727'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-01T09:05:19Z'
---
# buildScripts/buildThemes: mode all => combine dist/esm & dist/prod

* While `dist/dev` has a different output (not minified, source maps), the other dist modes have the same content.
* When building all, we should just copy the CSS folder & theme-map, instead of rebuilding it.

## Timeline

- 2025-05-29T09:50:32Z @tobiu assigned to @tobiu
- 2025-05-29T09:50:33Z @tobiu added the `enhancement` label
- 2025-06-01T09:03:41Z @tobiu referenced in commit `ca2d209` - "buildScripts/buildThemes: mode all => combine dist/esm & dist/prod #6727"
### @tobiu - 2025-06-01T09:05:19Z

A lot more complex than I thought. `buildEnv()` had to get converted to being `async`, to ensure that all files creations are done before copying files.

`CSSNano` can not get executed in a sync way.

- 2025-06-01T09:05:19Z @tobiu closed this issue

