---
id: 5591
title: 'model.Component: enhance 2way-bindings'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-07-19T16:09:13Z'
updatedAt: '2024-07-20T12:05:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5591'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-20T12:03:50Z'
---
# model.Component: enhance 2way-bindings

Right now, 2way only works in case the name of the config is exactly the same as the name of the bound data prop:

```
        bind: {
            intlFormatDay: {twoWay: true, value: data => data.intlFormatDay},
            weekStartDay : {twoWay: true, value: data => data.weekStartDay}
        },
```

This was obviously not intentional.

We should evaluate if we want to keep the current syntax or modify it. 2way kind of enforces to only allow direct bindings and no field combinations, since we can not know how to transform back out of the box.

So we would either use the regex-parsing inside VMs or adjust the syntax. e.g.:

```
        bind: {
            weekStartDay: {twoWay: true, property: 'data.foo.bar.baz'}
        },
```

## Timeline

- 2024-07-19T16:09:13Z @tobiu added the `enhancement` label
### @marklincoln - 2024-07-19T16:44:25Z

I think the new syntax would be better unless the prior syntax enables flexibility in combining field values to produce a calculated value.  Obviously, this calculation could be done in another way prior to the binding so this flexibility might not be necessary.  One question about the new syntax seems unclear: How does it bind to a stock config like the "value" property of the TextField?

### @tobiu - 2024-07-19T16:46:39Z

the properties (keys) inside the bind object are the names of the configs. for one way bindings, we do need the transformation function. using fat arrows is optional.

### @marklincoln - 2024-07-19T16:51:02Z

so, with the new syntax, I could do this?          
bind: {
    value: {twoWay: true, property: 'data.foo.bar.baz'}
},

- 2024-07-20T10:52:14Z @tobiu referenced in commit `56d791d` - "#5591 new testcase example"
- 2024-07-20T11:07:42Z @tobiu referenced in commit `83af87d` - "#5591 model.Component: 2way-bindings => working solution using the old syntax"
### @tobiu - 2024-07-20T12:03:50Z

I would like to close this ticket, since the first version is working fine.

You can test it inside `Neo.examples.model.twoWay`.

I did test the other approach a bit, but this one is complicated: we would need to use
new Function('data', \`data.${value.property}\`)

inside `createBindings()`, but also adjust `parseConfigs()`.

Some security issues and time consuming.

You are welcome to create a follow-up ticket though, in case you think it is important.

- 2024-07-20T12:03:50Z @tobiu closed this issue

