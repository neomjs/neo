---
id: 4198
title: 'form.field.Number: stepSize => support for values < 1'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-03-23T08:19:31Z'
updatedAt: '2023-03-23T10:47:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4198'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-23T10:47:31Z'
---
# form.field.Number: stepSize => support for values < 1

we need to use `Math.round()` to ensure to get reasonable values when using the spin buttons.

## Timeline

- 2023-03-23T08:19:31Z @tobiu added the `bug` label
- 2023-03-23T08:19:31Z @tobiu assigned to @tobiu
- 2023-03-23T08:20:18Z @tobiu referenced in commit `d33f098` - "form.field.Number: stepSize => support for values < 1 #4198 => test case"
- 2023-03-23T09:14:14Z @tobiu referenced in commit `9eaac23` - "form.field.Number: stepSize => support for values < 1 #4198"
### @tobiu - 2023-03-23T10:01:20Z

tested this with a `stepSize` of 0.01 and 0.001 and seems to work fine now. i will cache the amount of digits to reduce run-time calculations next.

- 2023-03-23T10:43:09Z @tobiu referenced in commit `3500294` - "#4198 caching the amount of stepSize digits"
- 2023-03-23T10:47:31Z @tobiu closed this issue

