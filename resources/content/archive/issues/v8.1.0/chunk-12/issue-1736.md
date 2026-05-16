---
id: 1736
title: 'controller.Component: add support for string based listeners when dynamically adding components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-08T14:51:34Z'
updatedAt: '2021-04-13T14:30:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1736'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-13T14:30:18Z'
---
# controller.Component: add support for string based listeners when dynamically adding components

Right now, the model.Component implementation is a bit more advanced.

Inside Neo.examples.model.advanced.MainContainerController we have the method:
```Javascript
    onAddButtonTextfieldButtonClick(data) {
        let me = this;

        me.getReference('content-container').insert(2, {
            items: [{
                ntype     : 'textfield',
                flex      : 'none',
                labelText : 'data.button2Text:',
                labelWidth: 150,
                width     : 300,

                bind: {
                    value: '${data.button3Text}'
                },

                listeners: {
                    change: me.onTextField3Change,
                    scope : me
                }
            }]
        });
    }
```

It would be nice if we can optionally specify it the same way as inside the MainContainer view as well:

```Javascript
    onAddButtonTextfieldButtonClick(data) {
        let me = this;

        me.getReference('content-container').insert(2, {
            items: [{
                ntype     : 'textfield',
                flex      : 'none',
                labelText : 'data.button2Text:',
                labelWidth: 150,
                width     : 300,

                bind: {
                    value: '${data.button3Text}'
                },

                listeners: {
                    change: 'onTextField3Change'
                }
            }]
        });
    }
```

## Timeline

- 2021-04-08T14:51:34Z @tobiu added the `enhancement` label
- 2021-04-08T14:51:34Z @tobiu assigned to @tobiu
### @tobiu - 2021-04-13T14:30:18Z

already resolved by #1757.

- 2021-04-13T14:30:18Z @tobiu closed this issue

