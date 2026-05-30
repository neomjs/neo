---
id: 5164
title: 'model.Component: internalSetData() => add support for smart sub tree updates'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-12-08T13:24:47Z'
updatedAt: '2023-12-08T13:27:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5164'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-08T13:27:33Z'
---
# model.Component: internalSetData() => add support for smart sub tree updates

Inside `Neo.examples.model.nestedData.MainContainer` we have the following use case:
```
model: {
    data: {
        user: {
            details: {
                firstname: 'Nils',
                lastname : 'Dehl'
            }
        }
    }
}
```

So far, updating vm data props only worked with passing the path to a leaf:
```
updateButton2Text(value) {
    this.getModel().setData({
        'user.details.lastname': value
    });
}
```

It would improve the developer experience a lot, in case we can also pass objects:
```
updateButton2Text(value) {
    this.getModel().setData({
        'user.details': {
            lastname: value
        }
    });
}
```

In this case, we do want to update the lastname leaf, without deleting or changing `firstname`.

the new logic will enable us to do so and parse value based objects recursivly. if you pass nested objects which do not exist as data props yet, they will get added as new bindable data props:

```
updateButton2Text(value) {
    this.getModel().setData({
        'user.details': {
            foo: {
                bar: {
                    baz: 'hi deniz!'
                }
            }
        }
    });
}
```

however: this approach also means that existing objects will get modified. if you want to store an existing data record, it will get affected.

@ExtAnimal @deniztoprak @ThorstenRaab 

## Timeline

- 2023-12-08T13:24:47Z @tobiu added the `enhancement` label
- 2023-12-08T13:24:47Z @tobiu assigned to @tobiu
- 2023-12-08T13:27:13Z @tobiu referenced in commit `4935ae4` - "model.Component: internalSetData() => add support for smart sub tree updates #5164"
- 2023-12-08T13:27:33Z @tobiu closed this issue

