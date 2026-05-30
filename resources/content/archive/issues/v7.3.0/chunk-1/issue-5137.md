---
id: 5137
title: '[discuss] form.field.Select => form.field.Combobox refactoring'
state: CLOSED
labels:
  - enhancement
  - discussion
  - stale
assignees: []
createdAt: '2023-12-05T10:57:32Z'
updatedAt: '2024-09-12T02:28:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5137'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:55Z'
---
# [discuss] form.field.Select => form.field.Combobox refactoring

@ExtAnimal @mxmrtns 

Max would like to see a `SelectField` implementation which is based on `select` and `option` tags.

Imho a ComboBox can already handle the functionality (via `editable: false)` and a real `SelectField` would add all options directly into the DOM. However, I am open minded :)

If you decide that the separation makes sense, we will need to rename the current `form.field.Select` into `form.field.ComboBox` (scope of this ticket) and then create a follow up ticket to create a new `form.field.Select`. The new implementation should be pretty easy.

In case you decide to just stick to the current implementation, this ticket can also get closed.

## Timeline

- 2023-12-05T10:57:32Z @tobiu added the `enhancement` label
- 2023-12-05T10:57:32Z @tobiu added the `discussion` label
### @github-actions - 2024-08-29T02:26:07Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:08Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:55Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:55Z @github-actions closed this issue

