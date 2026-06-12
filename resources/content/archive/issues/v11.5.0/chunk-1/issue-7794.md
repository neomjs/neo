---
id: 7794
title: Move highlight.js build from postinstall to buildAll
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-18T17:23:58Z'
updatedAt: '2025-11-18T17:26:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7794'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-18T17:26:27Z'
---
# Move highlight.js build from postinstall to buildAll

## Description
The current `postinstall` script in `package.json` triggers the highlight.js build process. This is considered too aggressive for a standard installation.

## Goal
Move the highlight.js build execution from the `postinstall` script in `package.json` to the `buildScripts/buildAll.mjs` script.

## Acceptance Criteria
1.  Remove `postinstall` script calling `buildHighlightJs.mjs` from `package.json`.
2.  Add execution of `buildScripts/buildHighlightJs.mjs` to `buildScripts/buildAll.mjs`, ensuring it runs as part of the standard build process (e.g., after `bundleParse5`).


## Timeline

- 2025-11-18T17:23:58Z @tobiu added the `enhancement` label
- 2025-11-18T17:23:59Z @tobiu added the `developer-experience` label
- 2025-11-18T17:23:59Z @tobiu added the `ai` label
- 2025-11-18T17:25:58Z @tobiu assigned to @tobiu
- 2025-11-18T17:26:20Z @tobiu referenced in commit `a9e30df` - "Move highlight.js build from postinstall to buildAll #7794"
- 2025-11-18T17:26:27Z @tobiu closed this issue
- 2025-11-18T17:37:05Z @tobiu referenced in commit `a8b33a0` - "Move highlight.js build from postinstall to buildAll #7794"

