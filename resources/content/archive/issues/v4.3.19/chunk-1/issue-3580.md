---
id: 3580
title: 'buildScripts/watchThemes: add support for imported SCSS files'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-12-07T17:16:09Z'
updatedAt: '2022-12-07T17:18:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3580'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-12-07T17:18:19Z'
---
# buildScripts/watchThemes: add support for imported SCSS files

since we are using a file buffer based sass rendering, import paths inside your own scss files can get resolved incorrectly.

we do need a regex-based parsing to adjust potentially wrong paths.

## Timeline

- 2022-12-07T17:16:09Z @tobiu added the `enhancement` label
- 2022-12-07T17:16:09Z @tobiu assigned to @tobiu
- 2022-12-07T17:17:31Z @tobiu referenced in commit `ae4bc07` - "buildScripts/watchThemes: add support for imported SCSS files #3580"
- 2022-12-07T17:18:19Z @tobiu closed this issue

