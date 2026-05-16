---
id: 2274
title: 'manager.Focus: focusChange event & trigger onFocusChange() on a cmp in case it exists'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-05T21:25:48Z'
updatedAt: '2021-06-05T21:27:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2274'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-05T21:27:11Z'
---
# manager.Focus: focusChange event & trigger onFocusChange() on a cmp in case it exists

focusChange is a combined event for the 3 events: focusEnter, focusLeave or focusMove

it fires after them.

to implement it, all 4 events and methods need the same signature.

use case: it is easier to just use `focusChange` of the other 3 events. less boilerplate code.

## Timeline

- 2021-06-05T21:25:48Z @tobiu added the `enhancement` label
- 2021-06-05T21:25:48Z @tobiu assigned to @tobiu
- 2021-06-05T21:27:03Z @tobiu referenced in commit `1793a91` - "manager.Focus: focusChange event & trigger onFocusChange() on a cmp in case it exists #2274"
- 2021-06-05T21:27:11Z @tobiu closed this issue

