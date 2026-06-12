---
id: 4380
title: Update phoneField inputPattern
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-05-04T08:47:28Z'
updatedAt: '2023-05-04T19:46:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4380'
author: ki1pen
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-04T19:46:41Z'
---
# Update phoneField inputPattern

The current inputPattern, that phoneField use for phone number validation, use regex that allows the user to use multiple minus signs after each other(e.g: -----). Update the regex for stricter phone number validation.


## Timeline

- 2023-05-04T08:47:28Z @ki1pen added the `enhancement` label
- 2023-05-04T11:01:02Z @tobiu referenced in commit `77a2c09` - "Merge pull request #4381 from ki1pen/dev

#4380 update inputPattern regex in form.field.Phone"
- 2023-05-04T19:46:41Z @tobiu closed this issue

