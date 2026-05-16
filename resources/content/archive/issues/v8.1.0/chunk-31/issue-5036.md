---
id: 5036
title: 'tree.Accordion: Selection model in tree.Accordion doesn''t work'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-10-18T13:56:04Z'
updatedAt: '2024-09-13T02:28:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5036'
author: pensuwan-k
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:28:51Z'
---
# tree.Accordion: Selection model in tree.Accordion doesn't work

The styling of the selected record doesn't get applied after the data for the tree.Accordion get updated.
It crashes in card layout context. The selection applied, get kick out of DOM, drop it back in, lost.


## Timeline

- 2023-10-18T13:56:04Z @pensuwan-k added the `bug` label
- 2023-10-19T11:03:04Z @tobiu referenced in commit `5726e38` - "#5036 examples.treeAccordion.MainContainer: added a remove DOM button"
### @tobiu - 2023-10-19T11:05:39Z

hi @pensuwan-k,

i added a "Remove DOM" button into the example:
<img width="1424" alt="Screenshot 2023-10-19 at 13 04 03" src="https://github.com/neomjs/neo/assets/1177434/acbd3915-2996-4048-b583-d9c43daf0530">

<img width="1430" alt="Screenshot 2023-10-19 at 13 04 20" src="https://github.com/neomjs/neo/assets/1177434/15e47702-a720-4297-937c-d2059b052840">

When I drop the DOM back in, the selection is still in place. We need a reproducible testcase.

### @pensuwan-k - 2023-10-19T13:43:45Z

After updating the store data (something like `accordion.store.data = accordion.store.data.splice(0,6);`), the selectionModel should be empty.

- 2023-10-19T18:25:36Z @tobiu referenced in commit `84f4933` - "v6.9.2 (#5048)

* #5030 harness test groups

* #5030 harness sub-groups

* 7041 - Select field input produces unexpected behaviour

* selection.table.RowModel: selecting a record should automatically scroll to the related table tow #4978

* main.mixin.DeltaUpdates: limit logs to the dev mode #5037

* #5036 examples.treeAccordion.MainContainer: added a remove DOM button

* update fileupload to remove change event on undefined oldValue

* replace every with foreach

* sort routes object on complexity

* moved initial handling to afterSet function. Dynamical routes possible at runtime

* fixes and improvements

* container.Base: destroy() => add a check if items exist #5044

* container.Base: mergeConfig() is causing issues in the latest version #5045

* form.field.Select: filterOperator & useFilter need to be processed through the config symbol #5046

* collection.Filter: endsWith, like & startsWith => add support for numbers #5047

* collection.Filter: removed closing ;

* examples.toolbar.paging.view.MainContainer: rowsPerPage margin

* examples.toolbar.paging.view.MainContainer: vdom tooltip => camel case

* dependencies update

* v6.9.2"
### @github-actions - 2024-08-29T02:26:28Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:28Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:50Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:51Z @github-actions closed this issue

