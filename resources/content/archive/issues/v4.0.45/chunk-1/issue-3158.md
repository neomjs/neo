---
id: 3158
title: ViewModel Store listener points to Controller method
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-06-15T15:53:28Z'
updatedAt: '2022-06-16T18:54:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3158'
author: Dinkh
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-16T18:54:05Z'
---
# ViewModel Store listener points to Controller method

I would like to add a listener to the ViewModel as a string. The string represents the method inside the ViewController / parent ViewController.

@example

##ViewModel
```
data: {
    userData_: {id: 4}              // _ (Underscore) at end ==>  onUserDataChange method in controller
},
stores: {
    main: {
        module: MainStore,
        listeners: {
            load: 'onMainStoreLoad' // string => method in ViewController
        }
    }
}
```

##ViewController
```
onUserDataChange(oldData, newData) {doYourStuff}

onMainStoreLoad(store, ...originalEvent) {doYourStuff}
```

## Timeline

- 2022-06-15T15:53:28Z @Dinkh added the `enhancement` label
- 2022-06-16T18:53:00Z @tobiu referenced in commit `aa9a4dc` - "ViewModel Store listener points to Controller method #3158"
### @tobiu - 2022-06-16T18:53:44Z

did some testing:

<img width="520" alt="Screenshot 2022-06-16 at 20 50 37" src="https://user-images.githubusercontent.com/1177434/174144322-80c9835f-7d7e-4810-a388-abea6ac2ecee.png">

<img width="794" alt="Screenshot 2022-06-16 at 20 50 47" src="https://user-images.githubusercontent.com/1177434/174144360-8e245cb7-dd57-44e7-b00c-eb0e8ec75733.png">

<img width="585" alt="Screenshot 2022-06-16 at 20 50 57" src="https://user-images.githubusercontent.com/1177434/174144379-8ba73fc8-06cc-435d-82b3-78ae3f451c2c.png">


- 2022-06-16T18:54:05Z @tobiu closed this issue

