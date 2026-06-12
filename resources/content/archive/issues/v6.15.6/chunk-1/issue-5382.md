---
id: 5382
title: Neo.container.DateSelector => refactoring
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-04-05T12:45:07Z'
updatedAt: '2024-04-09T13:24:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5382'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-09T13:24:17Z'
---
# Neo.container.DateSelector => refactoring

We already have `Neo.component.DateSelector`. Since we do want to add a new view to select month & year via mouse, it does make sense to refactor the current implementation.

Container with a header toolbar and a body container using a card layout.

@mxmrtns 

## Timeline

- 2024-04-05T12:45:07Z @tobiu added the `enhancement` label
- 2024-04-05T12:45:08Z @tobiu assigned to @tobiu
- 2024-04-05T12:45:38Z @tobiu referenced in commit `bb980f3` - "#5382 Neo.container.DateSelector: base class"
- 2024-04-05T12:49:46Z @tobiu referenced in commit `398ba9e` - "#5382 Neo.container.DateSelector: example app"
- 2024-04-05T12:53:52Z @tobiu referenced in commit `0248537` - "#5382 Neo.container.DateSelector: basic items setup"
- 2024-04-05T13:19:19Z @tobiu referenced in commit `6c1fe42` - "#5382 Neo.container.DateSelector: added the required configs"
- 2024-04-05T13:31:25Z @tobiu referenced in commit `a243ea5` - "#5382 Neo.container.DateSelector: basic logic to render the cmp"
- 2024-04-05T13:52:11Z @tobiu referenced in commit `b4c82d1` - "#5382 Neo.container.DateSelector: basic styling"
- 2024-04-05T14:00:13Z @tobiu referenced in commit `9a6531e` - "#5382 Neo.container.DateSelector: scss var files per theme, header toolbar border"
- 2024-04-05T14:05:26Z @tobiu referenced in commit `060fea0` - "#5382 Neo.container.DateSelector: prev & next button icons"
- 2024-04-05T14:09:24Z @tobiu referenced in commit `3fdd079` - "#5382 examples.container.dateSelector.MainContainer: updated the year selection range"
- 2024-04-07T15:16:56Z @tobiu referenced in commit `0816858` - "#5382 first rendering of the day view"
### @tobiu - 2024-04-07T15:17:49Z

WIP
<img width="606" alt="Screenshot 2024-04-07 at 17 17 19" src="https://github.com/neomjs/neo/assets/1177434/54d1c5a6-7e11-4f0c-b390-aa04c7ada09d">

- 2024-04-07T22:12:23Z @tobiu referenced in commit `c5ec337` - "#5382 onPrevButtonClick, onNextButtonClick mapped into this class"
- 2024-04-08T12:40:08Z @tobiu referenced in commit `e460053` - "#5382 afterSetShowCellBorders()"
- 2024-04-08T13:57:21Z @tobiu referenced in commit `ed7d103` - "#5382 changeMonth()"
- 2024-04-08T15:56:41Z @tobiu referenced in commit `342c78e` - "#5382 header toolbar button ui"
- 2024-04-09T13:24:17Z @tobiu closed this issue

