---
id: 4532
title: 'layout.Flexbox: afterSetGap()'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2023-07-10T13:26:15Z'
updatedAt: '2023-07-10T14:18:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4532'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-10T14:18:01Z'
---
# layout.Flexbox: afterSetGap()

without testing it, i think this line has a potential for errors:
`if (!value && !oldValue) return;`

if you change the gap from e.g. "5px" to null or vice versa, nothing will happen.

## Timeline

- 2023-07-10T13:26:15Z @tobiu added the `bug` label
- 2023-07-10T13:26:16Z @tobiu assigned to @Dinkh
### @tobiu - 2023-07-10T14:16:26Z

actually not true, since both have a `!`. so it will just return for undefined and null combos. i will fix the formatting and close the ticket.

- 2023-07-10T14:17:52Z @tobiu referenced in commit `d05233a` - "layout.Flexbox: afterSetGap() #4532 => formatting"
- 2023-07-10T14:18:01Z @tobiu closed this issue

