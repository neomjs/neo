---
id: 4857
title: Date field should show error when invalid date is entered manually
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-09-07T09:06:07Z'
updatedAt: '2023-09-07T10:54:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4857'
author: r-l-d
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-07T10:54:07Z'
---
# Date field should show error when invalid date is entered manually

**Describe the bug**
When using a date field and manually entering (typing) an invalid date (e.g., 30 February), there is no error shown.

**To Reproduce**
Steps to reproduce the behavior:
1. Manually type in an invalid date (30.02.2024) in the date field

**Expected behavior**
The date should be deemed invalid and an error should appear

**Screenshots**
<img width="471" alt="Screenshot 2023-09-07 at 11 02 03" src="https://github.com/neomjs/neo/assets/54277333/a77622cc-e27c-4cdd-92a6-685ac46743f6">


**Desktop (please complete the following information):**
 - OS: Mac OS Ventura 13.5.1
 - Browser [e.g. chrome, safari]: Chrome
 - Version [e.g. 22]: 116


**Additional context**
Add any other context about the problem here.


## Timeline

- 2023-09-07T09:06:07Z @r-l-d added the `bug` label
### @r-l-d - 2023-09-07T09:08:06Z

<img width="2553" alt="Screenshot 2023-09-07 at 11 07 48" src="https://github.com/neomjs/neo/assets/54277333/b5f58f11-69a3-458b-ad3a-5f15f658526d">


### @tobiu - 2023-09-07T10:53:28Z

interesting one. i was not aware that input type date even allows wrong inputs.

e.g. if you type a day of 35 and then use the arrow right key, it will adjust the day to the max value of the given month.

you are right though: typing in 30 and then moving the month to february will keep an invalid input. would be fair to say this is a browser bug.

let's fix this in neo anyways.

- 2023-09-07T10:53:58Z @tobiu referenced in commit `90210ec` - "Date field should show error when invalid date is entered manually #4857"
### @tobiu - 2023-09-07T10:54:07Z

<img width="313" alt="Screenshot 2023-09-07 at 12 50 27" src="https://github.com/neomjs/neo/assets/1177434/dde72847-cfc2-46b6-9a61-40d51117a533">

- 2023-09-07T10:54:07Z @tobiu closed this issue

