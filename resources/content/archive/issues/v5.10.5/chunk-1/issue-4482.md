---
id: 4482
title: Cross Site Scripting (XSS) vulnerability
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-05-29T16:43:41Z'
updatedAt: '2023-05-31T16:14:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4482'
author: Ghost
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-31T16:14:07Z'
---
# Cross Site Scripting (XSS) vulnerability

**Describe the bug**
Neo applications rendering unsanitized user inputs (e.g. forms) are vulnerable to XSS attacks.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to example Form application
2. Click on Firstname in Page 1
3. Enter: `"><div style='color: red;'>PWNED</div><input value="`
4. Navigate to any other page
5. Return back to Page 1

Another example:

1. Go to example Form application
2. Navigate to TextAreas page
3. Click Page 6 Field 1
4. Clear the text and enter: `</textarea><div style='color: red;'>PWNED</div><textarea>`
5. Navigate to any other page
6. Go back to TextAreas page

**Expected behavior**
User input should be escaped


## Timeline

- 2023-05-29T16:43:41Z @Ghost added the `bug` label
- 2023-05-29T16:53:42Z @Ghost cross-referenced by PR #4483
- 2023-05-31T16:14:07Z @tobiu closed this issue

