---
id: 5288
title: 'Portal.view.learn.MainContainerController: EditorConfig.json'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - maxrahder
createdAt: '2024-03-02T16:41:59Z'
updatedAt: '2024-09-12T02:28:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5288'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:10Z'
---
# Portal.view.learn.MainContainerController: EditorConfig.json

We are getting errors when loading the learning section:
<img width="523" alt="Screenshot 2024-03-02 at 16 04 57" src="https://github.com/neomjs/neo/assets/1177434/b8cf5e00-b130-4d43-99ef-350fd26e640f">

<img width="528" alt="Screenshot 2024-03-02 at 16 05 41" src="https://github.com/neomjs/neo/assets/1177434/3a896dba-58f3-491e-89da-272c7c56e8a9">

This file is missing inside the repo. @maxrahder: i think this is your node service for opening files inside your IDE.

We either need a flag to not trigger:
```
    onConstructed() {
        super.onConstructed();

        let me = this;

        // ...

        fetch('../../../../resources/data/deck/EditorConfig.json')
            .then(response => response.json()
                .then(data =>
                    me.getModel().setData('editorConfig', data)
                ))
    }
```

for all users, or the service needs to get into the repo. it could get modified to create a fork and a PR to submit changes to us.

## Timeline

- 2024-03-02T16:41:59Z @tobiu added the `bug` label
- 2024-03-02T16:41:59Z @tobiu assigned to @maxrahder
### @github-actions - 2024-08-29T02:25:33Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:34Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:09Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:10Z @github-actions closed this issue

