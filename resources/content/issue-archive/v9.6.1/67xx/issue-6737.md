---
id: 6737
title: 'buildScripts/buildESModules: smarter way to handle node module imports'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-01T13:32:03Z'
updatedAt: '2025-06-01T13:37:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6737'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-01T13:37:46Z'
---
# buildScripts/buildESModules: smarter way to handle node module imports

Inside `Portal.view.learn.ContentComponent` we have the following top-level import:
`import {marked} from '../../../../node_modules/marked/lib/marked.esm.js';`

This works fine inside the dev mode as well as webpack-based dist envs, but `dist/esm` can not handle it yet.

* We need to replace node module related imports for the new env (going 2 folder levels upwards).
* We need to set the `Neo.config.basePath` to match the top-level folder.
* We need to add `workerBasePath` for the new env.
* We need to adjust related logic inside the main thread addons

## Timeline

- 2025-06-01T13:32:04Z @tobiu assigned to @tobiu
- 2025-06-01T13:32:05Z @tobiu added the `enhancement` label
- 2025-06-01T13:32:19Z @tobiu referenced in commit `e0b7a0c` - "buildScripts/buildESModules: smarter way to handle node module imports #6737"
- 2025-06-01T13:37:46Z @tobiu closed this issue

