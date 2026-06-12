---
id: 311
title: 'core.Base: processConfigs()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-03-18T09:37:35Z'
updatedAt: '2020-03-18T09:39:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/311'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-18T09:39:01Z'
---
# core.Base: processConfigs()

configs which do not have a trailing underscore can get assigned to the instance in afterSet methods of "real" configs.

to avoid overriding the new value, we need a hasOwnProperty() check.

example: field.Picker => pickerWidth

## Timeline

- 2020-03-18T09:37:36Z @tobiu added the `enhancement` label
- 2020-03-18T09:37:36Z @tobiu assigned to @tobiu
- 2020-03-18T09:38:46Z @tobiu referenced in commit `87cbdbb` - "core.Base: processConfigs() #311"
### @tobiu - 2020-03-18T09:39:01Z

done.

- 2020-03-18T09:39:01Z @tobiu closed this issue

