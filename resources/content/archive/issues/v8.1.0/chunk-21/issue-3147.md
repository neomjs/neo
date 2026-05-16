---
id: 3147
title: 'buildScripts/watchThemes: add a try / catch block for the scss build'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-12T17:27:40Z'
updatedAt: '2022-06-12T17:40:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3147'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-12T17:40:03Z'
---
# buildScripts/watchThemes: add a try / catch block for the scss build

a failed scss compilation should not break the script.

this actually happens frequently to me, since i did enable auto-saving files inside my webstorm ide. the save call can happen while typing new selectors (in invalid states).

## Timeline

- 2022-06-12T17:27:40Z @tobiu added the `enhancement` label
- 2022-06-12T17:27:40Z @tobiu assigned to @tobiu
- 2022-06-12T17:39:18Z @tobiu referenced in commit `6b48010` - "buildScripts/watchThemes: add a try / catch block for the scss build #3147"
### @tobiu - 2022-06-12T17:40:03Z

<img width="894" alt="Screenshot 2022-06-12 at 19 39 27" src="https://user-images.githubusercontent.com/1177434/173245999-60a5647c-385c-4781-bb79-2f59969a239a.png">


- 2022-06-12T17:40:03Z @tobiu closed this issue

