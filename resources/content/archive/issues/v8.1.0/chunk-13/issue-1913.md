---
id: 1913
title: 'scss structure: imports => theme files need to import the base class'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-04-30T17:14:36Z'
updatedAt: '2021-05-04T10:11:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1913'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-04T10:11:27Z'
---
# scss structure: imports => theme files need to import the base class

we will need to adjust the structure:

theme files contain the scss vars as well as the css vars.

we need to break up this structure into 2 files.

example: to build a split button file, we are using the scss vars of button.Base.
the output must not contain the css vars for button.Base.

For a build we need: all parent hierarchy files for the scss vars, the current level of the css vars, mixins.

src files do only need to import the mixins.

## Timeline

- 2021-04-30T17:14:36Z @tobiu added the `enhancement` label
- 2021-05-04T10:11:27Z @tobiu closed this issue

