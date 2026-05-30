---
id: 2411
title: Double click on event results is JS error regarding invalid time format - possible TZ issue
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2021-06-18T17:36:01Z'
updatedAt: '2021-06-18T20:53:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2411'
author: keckeroo
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-18T20:53:07Z'
---
# Double click on event results is JS error regarding invalid time format - possible TZ issue

**Describe the bug**
When in week view, I double click on an event and I get the following JS error in the console :


![](https://files.slack.com/files-pri/TEK621CCA-F025FBC3TE1/screen_shot_2021-06-18_at_12.08.21.png)


**To Reproduce**
Steps to reproduce the behavior: (ensure to be in TZ other than DE)
1. Go to https://neomjs.github.io/pages/node_modules/neo.mjs/examples/calendar/basic/index.html
2. Double click on event
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Desktop (please complete the following information):**
 - OS: MacOS
 - Browser: Chrome
 - Version Latest

**Additional context**
Add any other context about the problem here.


## Timeline

- 2021-06-18T17:36:01Z @keckeroo added the `bug` label
### @keckeroo - 2021-06-18T17:40:42Z

![Screen Shot 2021-06-18 at 12 08 21](https://user-images.githubusercontent.com/1653769/122598378-5ea8e000-d032-11eb-88cb-fb720f4e066b.png)


### @tobiu - 2021-06-18T17:49:53Z

Thx Kevin, confirmed!

- 2021-06-18T20:52:53Z @tobiu referenced in commit `c07235c` - "Double click on event results is JS error regarding invalid time format - possible TZ issue #2411"
- 2021-06-18T20:53:07Z @tobiu closed this issue

