---
id: 6033
title: >-
  examples/button/Base: opening the menu list does no longer allow using the
  arrow keys to navigate right away
state: OPEN
labels:
  - bug
  - epic
  - no auto close
assignees:
  - tobiu
createdAt: '2024-10-15T22:45:26Z'
updatedAt: '2025-01-18T21:36:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6033'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# examples/button/Base: opening the menu list does no longer allow using the arrow keys to navigate right away

* looks like a regression bug to me. might be related to the `main.addon.Navigator` introduction
* most likely just a missing focus() call

## Comments

### @soumajit23 - 2024-10-18 07:18

Hello @tobiu , I would like to work on this issue.

### @tobiu - 2024-10-18 09:10

hi @soumajit23,

while contributions are welcome, i am afraid that this ticket is way too difficult for a first item to work on. you could easily spend a full week on it, since it requires in depth knowledge about the framework mechanics and change history.

My first thought was that it is related to @ThorstenRaab's commit, where he removed the focus() call when showing the button menu:
https://github.com/neomjs/neo/commit/342afbbb50d82dd5b4c1230885b6933be9a40e85#diff-e2256fc11cf65d84943c3bd398132cb7e134ddba3a4af65cda9234874bf93b58R547

(i have no clue why this commit had no ticket and description, since it did breaks things)

digging deeper, it is definitely also related to @ExtAnimal's changes on selection models (separating selections and focus of items).

best regards,
tobias

### @soumajit23 - 2024-10-18 09:49

@tobiu thank you for clarifying! Looking into it, I see that it is definitely quite difficult to work on. I suppose I will look into other issues to work on for the time being.

### @github-actions - 2025-01-17 02:27

This issue is stale because it has been open for 90 days with no activity.

## Activity Log

- 2024-10-15 @tobiu added the `bug` label
- 2024-10-15 @tobiu assigned to @tobiu
- 2024-10-18 @tobiu added the `epic` label
- 2025-01-17 @github-actions added the `stale` label
- 2025-01-18 @tobiu removed the `stale` label
- 2025-01-18 @tobiu added the `no auto close` label

