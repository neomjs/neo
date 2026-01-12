---
id: 6694
title: selection.table.RowModel select & deselct events do not fire at Table component
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-05-05T04:02:28Z'
updatedAt: '2025-05-12T08:14:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6694'
author: gplanansky
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-12T07:42:42Z'
---
# selection.table.RowModel select & deselct events do not fire at Table component

Bug:  RowModel  select & deselect events no longer heard by Table listeners

https://github.com/neomjs/neo/blob/9bbd4cdfe26b7da68aee44e039b21fde846f93b3/src/selection/table/RowModel.mjs#L124

`view.fire(isSelected ? 'select' : 'deselect', {record})`

At 8.5.0  "view was at Table component hence the select, deselect events  propogated from Table.  Refactoring after 8.5.0 left view sitting lower.   Use "view.parent"  to bring it back to Table level:

fix:    ` view.parent.fire(isSelected ? 'select' : 'deselect', {record})`




## Timeline

- 2025-05-05T04:02:28Z @gplanansky added the `bug` label
### @tobiu - 2025-05-05T08:33:58Z

Hi George,

I would not consider this as a bug. It made sense for several reasons to move selection models from grid & table container to the view. As a comparison: form.field.ComboBox has a selection model for the list which is used inside its picker, but not for the form field itself.

Devs can subscribe to `selectionChange` on a selection model directly.

For convenience, the owner view also fires `select` and `deselect` events. And it is very easy to subscribe to them (both, at configuration and run-time). E.g.
```
{
    module: TableContainer,
    viewConfig: {
        listeners: {select: 'onViewSelect'}
    }
}
```

So, if I understand you correctly, you would like that the SM fires the events on the table / grid view and additionally afterwards on the table / grid container too?

Be aware, that the header toolbar might get a selection model in the future too, to use keynav to navigate through the buttons. If this one would delegate the events to the parent container too, it would be trouble.

From a technical perspective, it would be easy to fire more events, but does it really make sense here (changing the subscriptions is easy too)?



### @gplanansky - 2025-05-11T12:20:27Z

I don't know about your reasoning,  it's above my pay grade.  :-)   What I do find, is that this regression bug breaks Neo's most important and distinctive feature, its declarative class configuration system.   

Namely, it breaks the declarative listeners configuration syntax for Neo's table and grid components.

These are arguably Neo's most important components (hence, much refactored in the last year).
If this is not a trivial regression oversight, it marks one hell of a breaking change to 
Neo's declarative configuration API.

The Table row select event, broken by this regression bug, is featured in Neo's
learning section treatment of declarative event listener configuration, summarized:

   _https://neomjs.com/dist/production/apps/portal/index.html#/learn/tutorials.Earthquakes_

   _Components and other classes fire events. For example, buttons fire
   click events, tables fire select events, and stores fire load events._

   _A component's event listeners are normally specified declaratively via
   the `listeners: {}` config:_

```
       listeners: {
           select: 'onTableSelect'
       },

```
   _The declarative configuration syntax adds the listeners to the config properties
   of a component item.  E.g., in order to update a TextField component to reflect
   the value of a text field:_

```
       static config = {
           ...
           items: [{
               module   : TextField,
               ...
               listeners: {
                   change: 'up.onTextChange'
               }
           }, {
           ...
           }]
       }
```

So this is established usage, enshrined in the learning section and workshop sessions for some years.

The regression error exactly breaks that configuration syntax for table and grid.

**Reproduce bug:**

The syntax doesn't appear for neo's table or grid apps and examples.   However it's easy to add it to `neo/examples/stateProvider/table:`

```
    import MainContainerStateProvider from './MainContainerStateProvider.mjs';
    import TableContainer             from '../../../src/table/Container.mjs';
    import Viewport                   from '../../../src/container/Viewport.mjs';

    class MainContainer extends Viewport {
        static config = {
        ...
        items: [{
            module      : TableContainer,
            ...
            listeners: {
                select: (data) => console.log('MainContainer.mjs listener select: data', data),
                deselect: (data) => console.log('MainContainer.mjs listener deselect: data', data),
            },
            ...
        }]
```
The bug and its fix are in  `neo/selection/table/RowModel.mjs `:

```
    onRowClick(data) {
        let me     = this,
            id     = data.data.currentTarget,
            {view} = me,
            isSelected, record;

        if (id) {
            record = view.getRecord(id);
            if (me.hasAnnotations(record)) {
                me.updateAnnotations(record)
            } else {
                me.toggleSelection(id);

                isSelected = me.isSelected(id);

                !isSelected && view.onDeselect?.(record);

                //view.fire(isSelected ? 'select' : 'deselect', {record})          // original, bug
                view.parent.fire(isSelected ? 'select' : 'deselect', {record})     // bug fix
            }
        }
    }
```

With "view.parent.fire", sucessive clicks on the (initially unselected) first table row
properly yield console messages:

```
    MainContainer.mjs:37 MainContainer.mjs listener select: data {record: Record, source: 'neo-table-container-1'}
    MainContainer.mjs listener deselect: data {record: Record, source: 'neo-table-container-1'}

```
Without the bug fix, the fired events do not register with the listeners.

### @tobiu - 2025-05-12T07:42:42Z

@gplanansky George, you are talking utter nonsense here.

To be clear, let us take a look at your use case. Previous version:
```
items: [{
    module: Table,

    listeners: {        
        select  : 'onSelectTableRow',
        deselect: 'onDeselectTableRow'
    }
}]
```

Current version:
```
items: [{
    module: Table,

    viewConfig: {
        listeners: {        
            select  : 'onSelectTableRow',
            deselect: 'onDeselectTableRow'
        }
    }
}]
```

After you chose to skip the last 60 releases (or around 2,000 commits), you are literally complaining that you now need to change 2 lines of code inside your app. Just moving your listeners into `viewConfig`, since selection models got moved into the grid or table view (as stated inside the release notes). This takes 2 minutes tops, less time than you spent on this thread.

I take it as a big compliment, how stable the neo api is.

Saying that this change "broke" the class config system is a blatant lie. No, configs get assigned exactly the same way to class prototypes and changing configs works the same way too. This ticket is not even related to the config system at all.

Obviously architectures can evolve, once the amount of complexity and new features grows. There are certain base design patterns though. One of them is "state flows downwards". Meaning: parents can modify their children as they like, children fire events to let potential parents (which they must not be aware of / rely on) know that something happened. Loose coupling.

`view.parent.fire()` would simply break this basic design pattern. This would create technical debt in a bad way, assuming that a grid container always has exactly one grid view as a direct child. This part could change in the future => locked columns.

A grid (or table) container is the host for the header toolbar and the view. There is no combined keyboard navigation or selection model for both. the grid view contains rows & cells, so the selection model belongs to the view, and this one should fire the events.

So your ask is to literally fire all events twice (on view and container level), which is expensive. Plus, you picked 1 out of 12 grid & table selection models, ignoring the other ones (which have to be consistent). "I am ignoring the grid, and am only using the table with only the row selection model" is not good enough for a framework change request. The result would be: the row model now fires select events on the parent container, while the other 11 ones fire them on view level.

I do not understand why you are refusing to just change the mentioned 2 lines of code and be done with it, and make such a drama instead.

[Update] As already mentioned on Slack, if you really believe that the developer experience gets worse in case you define the listeners where they belong, you can easily just extend `table.Container` and add:

```
onConstructed() {
    super.onConstructed();

    let me = this;

    me.view.on({
        deselect(...args) {me.fire('deselect(...args)}
        select(...args) {me.fire('select(...args)},
        scope: me
    })
}
```

- 2025-05-12T07:42:42Z @tobiu closed this issue

