---
id: 5017
title: 'Discussion: core.Base => merging strategy of configs'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - discussion
  - stale
assignees: []
createdAt: '2023-10-16T08:04:50Z'
updatedAt: '2024-09-13T02:28:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5017'
author: tobiu
commentsCount: 8
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:28:55Z'
---
# Discussion: core.Base => merging strategy of configs

Hi guys,

we need to discuss, how we want to merge configs and once we define the preferred default strategy, we do need to create follow-up tickets to implement / polish it as needed.

So far, neo was going for a shallow copy:
```
mergeConfig() {
    // ...
   return {...ctor.config, ...config};
}
```

@ExtAnimal's latest PR did change it into a deep merge:
```
mergeConfig() {
    // ...
   return Neo.merge(Neo.clone(ctor.config, true), config);
}
```

Side effects:
```
{
    layout: {ntype: 'vbox', align: 'stretch'}
}
```
getting extended or instantiated with:
```
{
    layout: {ntype: 'vbox'}
}
```
=> will keep the alignment, unless we manually nullify it.

Critical side effects: merge, by default, would also affect modules / classes / instances
```
{
    selectionModel: {module: RowModel}
}
```
getting extended or instantiated with:
```
{
    selectionModel: {module: CellModel}
}
```
=> this would merge the configs of both, which is expensive and not what we want.

So: modules / classes / Neo instances need to be off limit. I would also recommend that we should check for `ntype` and `className`: if an object has a different className, module or ntype => no merge, keep the new one as it is.

`Neo.typeOf()` can already detect instances / classes:
https://github.com/neomjs/neo/blob/dev/src/Neo.mjs#L490

It is used inside `Neo.clone()`, which will not touch classes / modules and optionally clone instances:
https://github.com/neomjs/neo/blob/dev/src/Neo.mjs#L232

**The question is: what are the spots (and how many are there) where we really want a deep merge?**

`cls`, `style` and container `items` (only in case they are objects?) come to mind.

**The goal for this ticket / discussion is figuring out if the default strategy should be a shallow copy or a deep merge.**

Once decided, we need to create follow-up tickets:
- We might need a smarter `mergeConfigs()` method
- configs could use a meta-object to switch to a different strategy. like:
`{foo: {mergeStrategy: 'deep-merge', value: 'bar'}}`
- benchmarking could make sense (in case we use a deep-merge as the default

## Timeline

- 2023-10-16T08:04:51Z @tobiu added the `enhancement` label
- 2023-10-16T08:06:01Z @tobiu added the `help wanted` label
- 2023-10-16T08:06:01Z @tobiu added the `discussion` label
### @ExtAnimal - 2023-10-16T08:09:37Z

Side effects:

```

{
    layout: {ntype: 'vbox', align: 'stretch'}
}
getting extended or instantiated with:

{
    layout: {ntype: 'vbox'}
}
```

That is the intention.

If the Container's *class* specifies something, then a *configuration* must win only in what it supplies.

The app author is obviously content with the defaults for the other properties.

### @ExtAnimal - 2023-10-16T08:18:30Z

This is how it becomes trivially easy to deeply configure whole nested Container blocks at all levels.

Look at the new PagingToolbar example.

It uses as the items in the toolbar:

```
            items : {
                'nav-button-first' : {
                    tooltip : 'Go to first page'
                },
                'nav-button-prev' : {
                    tooltip : 'Go to previous page'
                },
                'nav-button-next' : {
                    tooltip : 'Go to next page'
                },
                'nav-button-last' : {
                    tooltip : 'Go to last page'
                },

                // These two have been moved to the start of the Toolbar by their weights
                label : {
                    style  : { marginLeft : 0} ,
                    weight : -10000
                },
                rowsPerPage : {
                    tooltip : 'Set the number of rows to display in a page',
                    weight  : -999
                }
            }

```

So that is *merged* into the class's own `items` object. And we get to reconfigure the paging toolbar easily.

The example just adds a tooltip to each button.

How would this be done otherwise? Listeners, and dynamically setting configs. Will put adopters off.

We need to be purely declarative.

See the code in this example: https://bryntum.com/products/calendar/examples/sidebar-customization/

There is a "Show code" button at the top right.

<img width="217" alt="Screenshot 2023-10-16 at 10 19 39" src="https://github.com/neomjs/neo/assets/200516/ac772ada-1cdf-4ecd-a45a-2c01ad916530">



The `tbar` and `sidebar` are deeply reconfigured. No listeners, no getting into code, just "Apply this config block all the way down"

### @tobiu - 2023-10-16T08:25:15Z

to be clear: the discussion is not **either or**. Deep merges and shallow copies both make sense for specific spots. and we will need both.

step 1: figuring out the **default** strategy. then create follow-up tickets for best supporting it (and e.g. allow switching to a different strategy as needed).

### @Ghost - 2023-10-16T12:53:08Z

In my opinion It's better to create a major Neo release for this change (7.0.0) and continue with the development of 6.x.x for the ongoing projects. This would avoid the side effects, which are now difficult to anticipate. At some point of time, when we have enough bandwidth, we can switch to 7.0.0 and test it apart from the features / bug fixes that we are working on.

### @tobiu - 2023-10-16T18:28:41Z

@ExtAnimal's following PR: https://github.com/neomjs/neo/pull/5018 (merged)

sets the default merging strategy back to a shallow copy. we should still create follow-up tickets for specifying a deep-merge in a generic way.

### @ExtAnimal - 2023-10-17T10:45:32Z

Let's address this in 7.0

There should be no class-specific implementations of `mergeConfig`.

There should be no `setFields`.

We just need one loop through the incoming config block:

```
for (const key in config) {
    const
        value        = config[key],
        classDefault = me.constructor.config[key];

    me[key] = Neo.typeOf(value) === 'Object' && Neo.typeOf(classDefault) === 'Object' ? Neo.merge(Neo.clone(classDefault), value) : value;
}
```

That should be all it takes to set configs into the instance whether they defined configs coming in or just properties which need to be set.

### @github-actions - 2024-08-29T02:26:31Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:31Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:55Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:55Z @github-actions closed this issue

