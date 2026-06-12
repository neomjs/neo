---
id: 241
title: 'Field picker z-index incorrect - seems to be CSS class names being munged '
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2020-02-23T19:01:40Z'
updatedAt: '2024-09-28T02:32:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/241'
author: keckeroo
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:32:25Z'
---
# Field picker z-index incorrect - seems to be CSS class names being munged 

**Describe the bug**
The field picker appears under other items on the screen

**To Reproduce**
Steps to reproduce the behavior:
1. Go to fields examples
2. Click on field picker
3. Picker appears under other items on screen which overlap picker area

**Expected behavior**
Picker should always be top of z-index

**Screenshots**
<img width="280" alt="Screen Shot 2020-02-23 at 12 40 02" src="https://user-images.githubusercontent.com/1653769/75118100-91a8b280-563c-11ea-82e7-ec6fed41ba4a.png">

**Desktop (please complete the following information):**
 - OS: [e.g. iOS] MacOSX
 - Browser [e.g. chrome, safari] Chrome
 - Version [e.g. 22]

**Additional context**


## Timeline

- 2020-02-23T19:01:40Z @keckeroo added the `bug` label
### @tobiu - 2020-02-24T10:37:53Z

Hi Kevin,

thx for the report. There is indeed something wrong inside the picker field (adding more triggers messes with the CSS class-names).

Will take a look into it, by the latest when finishing the chip-field (which is needed for the RW2 app).

Best regards,
Tobi

### @github-actions - 2024-09-14T02:28:06Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:28:07Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:32:25Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:32:25Z @github-actions closed this issue

