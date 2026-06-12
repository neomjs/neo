---
id: 228
title: 'form.Container: getFields()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-02-04T15:47:47Z'
updatedAt: '2020-02-04T16:20:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/228'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-02-04T16:20:14Z'
---
# form.Container: getFields()

We need a method to get all fields (instances of classes extending form.field.Base), to make it easier to get all related field values (especially for deeply nested forms).

The first version should not cache references (risky to create memory leaks in case the form structure changes dynamically).

## Timeline

- 2020-02-04T15:47:47Z @tobiu added the `enhancement` label
- 2020-02-04T15:47:48Z @tobiu assigned to @tobiu
- 2020-02-04T16:12:17Z @tobiu referenced in commit `6f1e5b5` - "form.Container: getFields() #228 (in progress)"
- 2020-02-04T16:19:58Z @tobiu referenced in commit `bd06060` - "form.Container: getFields() #228"
### @tobiu - 2020-02-04T16:20:14Z

done.

- 2020-02-04T16:20:14Z @tobiu closed this issue

