---
id: 7823
title: Optimize highlight.js build to skip unnecessary regeneration
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T14:11:25Z'
updatedAt: '2025-11-20T14:15:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7823'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T14:15:33Z'
---
# Optimize highlight.js build to skip unnecessary regeneration

The `buildScripts/buildHighlightJs.mjs` script currently performs a full repository clone and build of highlight.js every time it runs. This is inefficient when running `buildAll` multiple times.

The script should be optimized to:
1. Check if the `dist/highlight` directory already contains the expected files.
2. If the files exist, skip the build process.
3. Use `commander` to add a `-f, --force` flag to bypass the check and enforce regeneration.

This will significantly speed up the build process for subsequent runs.

## Timeline

- 2025-11-20T14:11:27Z @tobiu added the `enhancement` label
- 2025-11-20T14:11:27Z @tobiu added the `developer-experience` label
- 2025-11-20T14:11:28Z @tobiu added the `ai` label
- 2025-11-20T14:11:43Z @tobiu assigned to @tobiu
- 2025-11-20T14:15:22Z @tobiu referenced in commit `6ed71d7` - "Optimize highlight.js build to skip unnecessary regeneration #7823"
- 2025-11-20T14:15:33Z @tobiu closed this issue

