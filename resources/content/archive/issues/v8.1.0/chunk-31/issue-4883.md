---
id: 4883
title: 'menu.List: re-add onItemClick()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-11T14:44:51Z'
updatedAt: '2023-09-11T14:45:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4883'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-11T14:45:46Z'
---
# menu.List: re-add onItemClick()

@ExtAnimal: we had the issue with menus showing up twice. removing the click handler entirely was a bad call, since this also removes handlers & routes for menu items.

i will add it back, plus adjust `showSubMenu()` to only render & mount in case there is a real change. this should also prevent the duplication.

## Timeline

- 2023-09-11T14:44:51Z @tobiu added the `bug` label
- 2023-09-11T14:44:51Z @tobiu assigned to @tobiu
- 2023-09-11T14:45:07Z @tobiu referenced in commit `7b91928` - "menu.List: re-add onItemClick() #4883"
- 2023-09-11T14:45:47Z @tobiu closed this issue
- 2023-09-11T14:56:28Z @tobiu referenced in commit `a32c98d` - "v6.4.1 (#4884)

* menu.List: re-add onItemClick() #4883
* v6.4.1"
- 2023-09-11T14:57:06Z @tobiu cross-referenced by PR #4885
- 2023-09-11T14:57:16Z @tobiu referenced in commit `8d2285a` - "v6.4.1 (#4884) (#4885)

* menu.List: re-add onItemClick() #4883
* v6.4.1"

