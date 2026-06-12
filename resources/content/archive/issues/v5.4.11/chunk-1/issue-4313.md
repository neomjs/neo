---
id: 4313
title: 'form.field.Select: When clicking on label of Select field, picker will stick and not hide'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-04-24T09:56:11Z'
updatedAt: '2023-04-24T11:29:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4313'
author: alberthashani
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-24T10:45:54Z'
---
# form.field.Select: When clicking on label of Select field, picker will stick and not hide

*(No description provided)*

## Timeline

- 2023-04-24T09:56:11Z @alberthashani added the `bug` label
### @tobiu - 2023-04-24T10:41:33Z

clicking on the trigger button:
<img width="980" alt="Screenshot 2023-04-24 at 12 37 46" src="https://user-images.githubusercontent.com/1177434/233973165-47d43e65-2d38-4b50-b64b-020bc8113b94.png">

clicking on a top positioned label:
<img width="984" alt="Screenshot 2023-04-24 at 12 37 59" src="https://user-images.githubusercontent.com/1177434/233973229-f4e70008-8d18-4658-922f-b58f12989ff4.png">

i think it is the accessibility rule which got added recently:
<img width="432" alt="Screenshot 2023-04-24 at 12 38 36" src="https://user-images.githubusercontent.com/1177434/233973363-9071ab38-8ab8-4493-b1e0-f1f94fc231b1.png">

=> this one could trigger a 2nd input click.

i will add a picker is mounting flag into `showPicker()` to prevent the picker from mounting multiple times.

- 2023-04-24T10:45:30Z @tobiu referenced in commit `f627e0a` - "form.field.Select: When clicking on label of Select field, picker will stick and not hide #4313"
### @tobiu - 2023-04-24T10:45:54Z

<img width="234" alt="Screenshot 2023-04-24 at 12 44 46" src="https://user-images.githubusercontent.com/1177434/233974347-87d0f30e-78e7-4971-bbd1-d32d0cb9815d.png">

i will create a new release to test it.

- 2023-04-24T10:45:54Z @tobiu closed this issue
### @alberthashani - 2023-04-24T11:29:17Z

Just tested it, it works. Thanks @tobiu for the quick fix :)


