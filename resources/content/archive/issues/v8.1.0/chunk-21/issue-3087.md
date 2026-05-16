---
id: 3087
title: 'Table.View: Null values are not supported in default Renderer'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2022-05-21T20:42:59Z'
updatedAt: '2022-05-21T20:49:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3087'
author: davhm
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-21T20:49:11Z'
---
# Table.View: Null values are not supported in default Renderer

**Describe the bug**
When attempting to render null values with the default renderer for a table view column, a JS error is thrown

**Expected behavior**
I would expect the table to render correctly and leave the cell empty for which the value is null in the Store field.

## Timeline

- 2022-05-21T20:42:59Z @davhm added the `bug` label
- 2022-05-21T20:49:12Z @tobiu closed this issue
- 2022-05-21T20:49:12Z @tobiu referenced in commit `76a14a1` - "Merge pull request #3088 from davhm/dev

[#3087] Table.View: Null values are not supported in default Renderer"

