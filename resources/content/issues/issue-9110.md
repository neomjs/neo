---
id: 9110
title: 'DevIndex: Support ''country'' URL search parameter'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T08:36:25Z'
updatedAt: '2026-02-12T08:54:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9110'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T08:54:52Z'
---
# DevIndex: Support 'country' URL search parameter

Implement support for the `?country=code` URL search parameter in the DevIndex application.
- Retrieve the search string from the main thread using `Neo.Main.getByPath`.
- Parse the parameter.
- Update the `Country` combo box in `DevIndex.view.home.ControlsContainer`.
- Ensure this triggers the grid filtering logic.

## Timeline

- 2026-02-12T08:36:26Z @tobiu added the `enhancement` label
- 2026-02-12T08:36:26Z @tobiu added the `ai` label
- 2026-02-12T08:53:55Z @tobiu referenced in commit `efdb7a2` - "feat: Implement 'country' URL param support for DevIndex (#9110)"
### @tobiu - 2026-02-12T08:54:06Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `country` URL parameter support.
> - Added `MainContainerController` to handle top-level view logic.
> - Implemented `onComponentConstructed` in the controller to parse `location.search` from the main thread.
> - Added `reference: 'country-field'` to the Country combo in `ControlsContainer`.
> - The controller sets the value of the country field if the URL parameter is present, which triggers the existing filter logic.
> - **Note:** Grid filtering needs further adjustment to handle this initial state correctly (currently WIP).

- 2026-02-12T08:54:38Z @tobiu assigned to @tobiu
- 2026-02-12T08:54:53Z @tobiu closed this issue
- 2026-02-12T08:55:11Z @tobiu added parent issue #9106

