---
id: 4135
title: 'form.Container: getValues() => add support for dots inside field names'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-23T10:36:29Z'
updatedAt: '2023-02-23T10:48:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4135'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-23T10:48:00Z'
---
# form.Container: getValues() => add support for dots inside field names

in case a field has `name: 'page3.field1'`, `getValues()` should return a nested object like:
```
{
    page3: {
        field1: 'foo'
    }
}
```

## Timeline

- 2023-02-23T10:36:29Z @tobiu added the `enhancement` label
- 2023-02-23T10:36:29Z @tobiu assigned to @tobiu
- 2023-02-23T10:47:40Z @tobiu referenced in commit `ae6f97a` - "form.Container: getValues() => add support for dots inside field names #4135"
- 2023-02-23T10:48:00Z @tobiu closed this issue

