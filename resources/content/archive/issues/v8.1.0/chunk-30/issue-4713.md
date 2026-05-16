---
id: 4713
title: 'docs app: add support for comments which contain markdown'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-14T21:19:42Z'
updatedAt: '2023-08-14T21:37:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4713'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-14T21:37:13Z'
---
# docs app: add support for comments which contain markdown

this is needed for the new file upload field

## Timeline

- 2023-08-14T21:19:42Z @tobiu added the `enhancement` label
- 2023-08-14T21:19:43Z @tobiu assigned to @tobiu
- 2023-08-14T21:20:09Z @tobiu referenced in commit `5f16551` - "docs app: add support for comments which contain markdown #4713"
- 2023-08-14T21:23:20Z @tobiu referenced in commit `11b01e6` - "#4713 removed the markdown parsing from the docs app again"
- 2023-08-14T21:34:31Z @tobiu referenced in commit `d01aada` - "#4713 added the markdown parsing into the docs app program"
### @tobiu - 2023-08-14T21:37:13Z

got it right now, i think.

the markdown parsing is now inside the generate-docs program (just slightly slower) and the docs app itself is back at the normal speed.

- 2023-08-14T21:37:13Z @tobiu closed this issue

