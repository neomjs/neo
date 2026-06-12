---
id: 3201
title: 'form.field.Text: styling for invalid values'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-27T09:00:18Z'
updatedAt: '2022-06-27T09:05:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3201'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-27T09:01:32Z'
---
# form.field.Text: styling for invalid values

currently, form.fields are using a DOM level based pseudo selector to mark the validity.

this needs to change, e.g. in case we create a form for creating a new entity, we most likely want the fields to look "clean" => no "red borders" (error indicators).

as a first step, we should remove the DOM based selector rules and use the neo `neo-invalid` rule instead.

this will apply a border on the wrapperEl in case this exists => same level as the active border.

for now, i think the active state should have a prio compared to errors (a bit like validate on blur), but this could be optional (follow up ticket).

## Timeline

- 2022-06-27T09:00:18Z @tobiu added the `enhancement` label
- 2022-06-27T09:00:19Z @tobiu assigned to @tobiu
- 2022-06-27T09:00:37Z @tobiu referenced in commit `ce2087a` - "form.field.Text: styling for invalid values #3201"
- 2022-06-27T09:01:32Z @tobiu closed this issue

