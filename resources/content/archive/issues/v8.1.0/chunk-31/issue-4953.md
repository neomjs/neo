---
id: 4953
title: 'form.field.Text: emptyValue config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-09-28T10:47:04Z'
updatedAt: '2023-09-28T10:47:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4953'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-28T10:47:38Z'
---
# form.field.Text: emptyValue config

right now, a TextField returns null when empty or clicking on the clear trigger, but it returns an empty string, in case we clear the last char via the delete key.

this feels not consistent and we should add a new config to make it configurable (overwritable) for apps.

@linchen

## Timeline

- 2023-09-28T10:47:04Z @tobiu added the `enhancement` label
- 2023-09-28T10:47:04Z @tobiu assigned to @tobiu
- 2023-09-28T10:47:32Z @tobiu referenced in commit `54459ff` - "form.field.Text: emptyValue config #4953"
- 2023-09-28T10:47:38Z @tobiu closed this issue
- 2023-09-28T10:55:14Z @tobiu referenced in commit `d91c921` - "v6.7.3 (#4954)

* component.Base: getDomRect() => inconsistent return values #4950

* main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker #4951

* main.DomAccess: getBoundingClientRect() minor cleanup

* draggable.toolbar.SortZone: switchItems() => regression issue #4948

* main.DomAccess: -testing log

* table.Container: get headerToolbar(), get view() convenience shortcuts #4952

* form.field.Text: emptyValue config #4953

* v6.7.3"

