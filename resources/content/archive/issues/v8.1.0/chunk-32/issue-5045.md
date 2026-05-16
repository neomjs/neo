---
id: 5045
title: 'container.Base: mergeConfig() is causing issues in the latest version'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-10-19T16:35:42Z'
updatedAt: '2023-10-19T16:37:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5045'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-19T16:37:19Z'
---
# container.Base: mergeConfig() is causing issues in the latest version

regression issue.

old code:
```
    mergeConfig(...args) {
        let me     = this,
            config = super.mergeConfig(...args);

        // avoid any interference on prototype level
        // does not clone existing Neo instances

        if (config.itemDefaults) {
            me._itemDefaults = Neo.clone(config.itemDefaults, true, true);
            delete config.itemDefaults
        }

        if (config.items) {
            me._items = Neo.clone(config.items, true, true);
            delete config.items
        }

        return config
    }
```

new code:
```
    mergeConfig(...args) {
        let me     = this,
            config = super.mergeConfig(...args);

        // avoid any interference on prototype level
        // does not clone existing Neo instances

        if (config.itemDefaults) {
            me._itemDefaults = Neo.clone(config.itemDefaults, true, true);
            delete config.itemDefaults
        }

        if (config.items) {
            // If we are passed an object, merge the class's own items object into it
            me.items = Neo.typeOf(config.items) === 'Object' ?
                Neo.merge(Neo.clone(me.constructor.config.items), config.items) : config.items;
            delete config.items
        }

        return config
    }
```

while we do have a new `beforeSetItems()` method, the initial cloning part got lost.

## Timeline

- 2023-10-19T16:35:42Z @tobiu added the `enhancement` label
- 2023-10-19T16:35:42Z @tobiu assigned to @tobiu
- 2023-10-19T16:37:01Z @tobiu referenced in commit `4e59070` - "container.Base: mergeConfig() is causing issues in the latest version #5045"
- 2023-10-19T16:37:19Z @tobiu closed this issue
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

