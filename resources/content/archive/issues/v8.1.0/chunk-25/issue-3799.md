---
id: 3799
title: Container needs a getReference() method
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-01-06T01:21:19Z'
updatedAt: '2023-01-06T07:56:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3799'
author: maxrahder
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-06T07:56:42Z'
---
# Container needs a getReference() method

Simple container views may not need a controller, and may still need to get references to child items. For consistency, the component should be able to look up components via their "reference" just like their controller can.

There is a `this.down({})` method, but strangely, that doesn't work for child items that have a "refence" config. This.down using the "reference" property should also work. 

## Timeline

- 2023-01-06T01:21:19Z @maxrahder added the `enhancement` label
### @tobiu - 2023-01-06T07:56:42Z

hi max,

make sure you don't have any typos in there (you wrote "refence"). it definitely does work, otherwise references would not.

https://github.com/neomjs/neo/blob/dev/src/controller/Component.mjs#L116

```
    getReference(name) {
        let me        = this,
            component = me.references[name];

        if (!component) {
            component = me.component.down({reference: name});

            if (component) {
                me.references[name] = component;
            }
        }

        return component || null;
    }
```

closing the ticket. if you find a breaking use case, we can re-open it :)

- 2023-01-06T07:56:42Z @tobiu closed this issue

