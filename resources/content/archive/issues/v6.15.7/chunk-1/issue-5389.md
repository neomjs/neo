---
id: 5389
title: 'core.Util: isRecord()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-04-12T09:29:48Z'
updatedAt: '2024-04-12T09:32:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5389'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-12T09:32:08Z'
---
# core.Util: isRecord()

since we changed `isObject()` to only return true for "real" objects, it will return false for records.

so, we do need a new method to check if a given input is a neo data record.

the new method needs to get used inside `form.field.ComboBox`.

## Timeline

- 2024-04-12T09:29:48Z @tobiu added the `enhancement` label
- 2024-04-12T09:29:48Z @tobiu assigned to @tobiu
- 2024-04-12T09:31:57Z @tobiu referenced in commit `5acf083` - "core.Util: isRecord() #5389"
- 2024-04-12T09:32:08Z @tobiu closed this issue

