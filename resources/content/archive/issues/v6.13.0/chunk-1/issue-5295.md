---
id: 5295
title: 'list.Base: keyboard navigation'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-03-04T21:44:31Z'
updatedAt: '2024-03-05T09:17:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5295'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-05T09:17:25Z'
---
# list.Base: keyboard navigation

inside the learning section we now have a TreeList on the left side and a List on the right side.

clicking on the item "Earthquakes" => keynav works fine.

clicking on an item inside the right list => still switches items inside the left list when using keynav.

did not look into the code yet.

<img width="1514" alt="Screenshot 2024-03-04 at 22 36 34" src="https://github.com/neomjs/neo/assets/1177434/d1ab2b74-9f64-4f1d-b42c-b2d59b75b7c7">

## Timeline

- 2024-03-04T21:44:31Z @tobiu added the `bug` label
- 2024-03-04T21:44:31Z @tobiu assigned to @ExtAnimal
- 2024-03-05T09:06:20Z @tobiu unassigned from @ExtAnimal
- 2024-03-05T09:06:22Z @tobiu assigned to @tobiu
### @tobiu - 2024-03-05T09:07:26Z

this one is an easy fix: `itemsFocusable` is used inside `list.Base`, but defined inside `menu.List`.

i will move the config into the base class. true should be the default for all lists.

- 2024-03-05T09:12:20Z @tobiu referenced in commit `2aa52eb` - "#5295 moving the itemsFocusable config from menu.List to list.Base."
- 2024-03-05T09:17:25Z @tobiu closed this issue
- 2024-03-26T16:29:39Z @tobiu referenced in commit `812998f` - "#5295 moving the itemsFocusable config from menu.List to list.Base."

