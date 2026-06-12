---
id: 5772
title: 'Neo.setupClass() => check for a namespace and return it right away, in case it exists'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-17T19:27:19Z'
updatedAt: '2024-08-18T06:06:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5772'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-18T06:06:19Z'
---
# Neo.setupClass() => check for a namespace and return it right away, in case it exists

This can happen when using different versions of neo.mjs
=> Especially singletons (IdGenerator) must stay unique.

This can also happen when using different environments of neo.mjs in parallel.
Example: code.LivePreview running inside a dist/production app.

## Timeline

- 2024-08-17T19:27:19Z @tobiu added the `enhancement` label
- 2024-08-17T19:27:19Z @tobiu assigned to @tobiu
- 2024-08-17T19:27:40Z @tobiu referenced in commit `ae5f16c` - "Neo.setupClass() => check for a namespace and return it right away, in case it exists #5772"
- 2024-08-17T19:28:13Z @tobiu referenced in commit `17704c3` - "#5772 adjusting all non-singleton class exports for the src folder"
- 2024-08-17T20:24:42Z @tobiu referenced in commit `3c250d6` - "#5772 adjusting all non-singleton class exports for the apps folder"
- 2024-08-17T20:25:28Z @tobiu referenced in commit `f9847f3` - "Neo.setupClass() => return value docs comment #5772"
- 2024-08-17T20:34:19Z @tobiu referenced in commit `1b9d646` - "#5772 adjusting all non-singleton class exports for the docs app folder"
- 2024-08-17T21:57:39Z @tobiu referenced in commit `fdaa246` - "#5772 adjusting all non-singleton class exports for the examples folder WIP"
- 2024-08-18T05:55:52Z @tobiu referenced in commit `d94be6a` - "#5772 adjusting all non-singleton class exports for the examples folder"
- 2024-08-18T06:01:47Z @tobiu referenced in commit `d15d1d4` - "#5772 adjusting all non-singleton class exports for the buildScripts folder"
- 2024-08-18T06:06:19Z @tobiu closed this issue

