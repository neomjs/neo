---
id: 5009
title: 'dialog.Base: animateHide() => remove the CSS selector removal before removing the node'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-10-12T06:13:00Z'
updatedAt: '2023-10-12T06:16:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5009'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-12T06:16:07Z'
---
# dialog.Base: animateHide() => remove the CSS selector removal before removing the node

3 times remove in one title :)

in short: we are adding the rule as a delta update, so it will not get into the vdom (which is fine).

when removing the node, there is no need to purge the selector first.

## Timeline

- 2023-10-12T06:13:01Z @tobiu added the `enhancement` label
- 2023-10-12T06:13:01Z @tobiu assigned to @tobiu
- 2023-10-12T06:15:46Z @tobiu referenced in commit `1503d02` - "dialog.Base: animateHide() => remove the CSS selector removal before removing the node #5009"
- 2023-10-12T06:16:07Z @tobiu closed this issue
- 2023-10-13T11:16:46Z @tobiu referenced in commit `eb1b5ee` - "v6.8.3 (#5015)

* LearnNeo app shell (create-app output)

* LearnNeo: initial app content (copied from the neomjs/learning-section repo)

* PR template: replaced master with main

* Scoping the learning section content into resources/data

* Fix Select field editable config

* dialog.Base: animateHide() => remove the CSS selector removal before removing the node #5009

* form.field.Text: config order

* examples.form.field.select.MainContainer: added a readOnly checkbox

* examples.todoList.version1.MainComponent: hotfix (data is now a reserved config)

* Add change event to fileupload

* Revert changing visibility of triggers on editable change

* v6.8.3"

