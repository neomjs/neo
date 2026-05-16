---
id: 5381
title: 'form.Base: getValue() => getSubmitValue()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-04-04T12:00:58Z'
updatedAt: '2024-04-04T12:14:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5381'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-04T12:14:04Z'
---
# form.Base: getValue() => getSubmitValue()

It can be confusing for devs to spot the difference for `value` and `getValue()`, so we should use a clearer name to highlight the difference.

until the next major release, this is a non-breaking change (both will work).

## Timeline

- 2024-04-04T12:00:58Z @tobiu added the `enhancement` label
- 2024-04-04T12:00:59Z @tobiu assigned to @tobiu
- 2024-04-04T12:13:58Z @tobiu referenced in commit `d70ca07` - "form.Base: getValue() => getSubmitValue() #5381"
- 2024-04-04T12:14:04Z @tobiu closed this issue
- 2024-04-04T12:25:33Z @tobiu referenced in commit `4d2641c` - "#5381 apps & examples => changed form.getValues() to form.getSubmitValues()"

