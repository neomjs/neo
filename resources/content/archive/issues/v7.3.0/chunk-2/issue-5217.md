---
id: 5217
title: 'form.field.Date: shows the native picker when using the space key'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - ExtAnimal
createdAt: '2024-02-13T08:15:42Z'
updatedAt: '2024-09-12T02:28:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5217'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:29Z'
---
# form.field.Date: shows the native picker when using the space key

i noticed that pressing enter does show the neo picker. maybe we could just convert space into enter in this case, but open for other solutions.

## Timeline

- 2024-02-13T08:15:42Z @tobiu added the `bug` label
- 2024-02-13T08:15:42Z @tobiu assigned to @ExtAnimal
### @mxmrtns - 2024-02-13T08:30:07Z

Hi @tobiu, please make sure to always comply with the WCAG guideline here. For example the picker should show when pressing Enter OR Space
https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/

### @tobiu - 2024-02-13T08:37:01Z

hi @mxmrtns, correct, when we fix space, the neo picker should show for enter & space in the same way.

i moved the a11y topic into another ticket: https://github.com/neomjs/neo/issues/5219

### @github-actions - 2024-08-29T02:25:47Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:47Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:28Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:29Z @github-actions closed this issue

