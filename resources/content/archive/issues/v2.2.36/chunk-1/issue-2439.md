---
id: 2439
title: Selecting calendar date makes UI jump around trying to find a date to stop on
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2021-06-21T14:39:31Z'
updatedAt: '2021-06-21T14:50:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2439'
author: keckeroo
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-21T14:50:26Z'
---
# Selecting calendar date makes UI jump around trying to find a date to stop on

**Describe the bug**
Clicking on a date in the calendar (when your system is not in DE) will result in calendar switching to different dates in a seemingly random fashion

**To Reproduce**
Steps to reproduce the behavior:
1. Ensure computer is set to a time zone other than DE
2. Go to https://neomjs.github.io/pages/node_modules/neo.mjs/examples/calendar/basic/index.html
3. Click on any day on the calendar
4. See error in console

**Expected behavior**
Calendar should change to selected date

**Screenshots**
Attached

**Desktop (please complete the following information):**
Not browser related

**Additional context**
Add any other context about the problem here.
![calendar-jump](https://user-images.githubusercontent.com/1653769/122780484-7f607800-d274-11eb-9b36-452f5639919b.gif)


## Timeline

- 2021-06-21T14:39:31Z @keckeroo added the `bug` label
- 2021-06-21T14:50:00Z @tobiu referenced in commit `845900c` - "Selecting calendar date makes UI jump around trying to find a date to stop on #2439"
### @tobiu - 2021-06-21T14:50:26Z

fixed.

- 2021-06-21T14:50:26Z @tobiu closed this issue

