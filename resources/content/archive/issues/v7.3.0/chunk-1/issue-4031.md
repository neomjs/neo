---
id: 4031
title: Firefox does not support dynamic imports inside the worker scope
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2023-02-12T11:12:25Z'
updatedAt: '2024-09-12T02:29:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4031'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:39Z'
---
# Firefox does not support dynamic imports inside the worker scope

Cross reference ticket.

While the support for JS modules will get released in v111:
https://bugzilla.mozilla.org/show_bug.cgi?id=1247687

the support for dynamic imports inside the worker scope is still not implemented:
https://bugzilla.mozilla.org/show_bug.cgi?id=1540913

I just tested v111 inside FF nightly:
<img width="1282" alt="Screenshot 2023-02-12 at 12 10 01" src="https://user-images.githubusercontent.com/1177434/218307557-9175976b-e0b1-4d00-b643-104597f32e8f.png">

and added a comment to the related ticket.

## Timeline

- 2023-02-12T11:12:25Z @tobiu added the `bug` label
- 2023-02-12T11:12:26Z @tobiu assigned to @tobiu
### @tobiu - 2023-02-12T11:14:43Z

my comment is here:
https://bugzilla.mozilla.org/show_bug.cgi?id=1540913#c16

### @tobiu - 2023-02-13T08:49:33Z

Yulia grabbed the ticket now . Promising :)

<img width="823" alt="Screenshot 2023-02-13 at 09 37 53" src="https://user-images.githubusercontent.com/1177434/218412233-98aaa3b8-2afb-4f00-b9a8-0e66c825eb54.png">

### @github-actions - 2024-08-29T02:27:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:40Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:38Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:39Z @github-actions closed this issue

