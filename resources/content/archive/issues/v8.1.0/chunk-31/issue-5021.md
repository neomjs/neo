---
id: 5021
title: 'examples.table.container.MainContainer: resorting columns can break the cell renderer for components'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-10-16T18:52:39Z'
updatedAt: '2023-10-16T18:53:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5021'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-16T18:53:23Z'
---
# examples.table.container.MainContainer: resorting columns can break the cell renderer for components

edge case where we do not get unique cell ids (they rely on the col data field).

https://github.com/neomjs/neo/assets/1177434/321a3788-cf76-4812-a2eb-22e3eaa311ad



## Timeline

- 2023-10-16T18:52:39Z @tobiu added the `bug` label
- 2023-10-16T18:52:40Z @tobiu assigned to @tobiu
- 2023-10-16T18:52:58Z @tobiu referenced in commit `ebcf154` - "examples.table.container.MainContainer: resorting columns can break the cell renderer for components #5021"
### @tobiu - 2023-10-16T18:53:23Z

<img width="1255" alt="Screenshot 2023-10-16 at 20 53 07" src="https://github.com/neomjs/neo/assets/1177434/fedbfd6c-7b77-4a7c-8836-607cae19798f">


- 2023-10-16T18:53:23Z @tobiu closed this issue
- 2023-10-17T15:06:08Z @tobiu referenced in commit `8fbddd0` - "v6.9.0 (#5027)

* Tooltip delegation and aligning

* tooltip alignment PR cleanup

* fixing the default example views layout issue

* LearnNeo: first tree items & example content file

* LearnNeo.view.home.MainContainerController: rendering a first file into the contentContainer

* tableView: createViewData() => add support for colspan #5014

* examples.table.container.MainStore: added the country field for the colspan record

* core.Observable: fixing the docs build

* table.View: applyRendererOutput() => cell ids for non store based implementations is broken #5019

* table.View: applyRendererOutput() => re-add support for renderers containing an object with html & style props #5020

* Revert deep merge of all configs. Implement merge of Container `items` where needed

* Docs

* examples.table.container.MainContainer: resorting columns can break the cell renderer for components #5021

* form.field.Range: removing the debounce for now #5022

* Router implementation in Neo (#5023)

* Route part 1

* first step route demo app

* first step route included

* route demonstrator

* styling fix

* Minor fixes

* v6.9.0"

