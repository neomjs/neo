---
id: 3151
title: 'data.Model: fields => mapping property'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-13T09:40:51Z'
updatedAt: '2022-06-13T09:59:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3151'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-13T09:59:57Z'
---
# data.Model: fields => mapping property

it would be nice to map nested API values to top level model fields.

example:

```
{
    name   : 'id',
    mapping: 'foo.bar.baz.id'
}
```

to get this working, we will need to adjust `data.RecordFactory`.

## Timeline

- 2022-06-13T09:40:51Z @tobiu added the `enhancement` label
- 2022-06-13T09:40:52Z @tobiu assigned to @tobiu
- 2022-06-13T09:48:52Z @tobiu referenced in commit `c20c038` - "data.Model: fields => mapping property #3151"
- 2022-06-13T09:49:02Z @tobiu closed this issue
- 2022-06-13T09:58:33Z @tobiu reopened this issue
- 2022-06-13T09:59:35Z @tobiu referenced in commit `d65bb39` - "data.Model: fields => mapping property #3151 hotfix"
- 2022-06-13T09:59:57Z @tobiu closed this issue

