---
id: 2113
title: examples/form/field/email/ permits invalid syntax (name@something)
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2021-05-22T19:55:21Z'
updatedAt: '2024-09-16T02:37:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2113'
author: keckeroo
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:37:10Z'
---
# examples/form/field/email/ permits invalid syntax (name@something)

**Describe the bug**
The email validator is permitting invalid email syntax of 'name@domain' (without the TLD)

![Screen Shot 2021-05-22 at 2 53 33 PM](https://user-images.githubusercontent.com/1653769/119239284-b58fc800-bb0d-11eb-8ddc-efd14c84ab1c.png)


## Timeline

- 2021-05-22T19:55:21Z @keckeroo added the `bug` label
### @tobiu - 2021-06-03T18:52:44Z

https://en.wikipedia.org/wiki/Email_address#Examples

![Screenshot 2021-06-03 at 20 50 53](https://user-images.githubusercontent.com/1177434/120696965-723e3d80-c4ad-11eb-8d9e-1b930fd05120.png)

by default, `<input type="email">` will allow local domains. most of the time it makes little sense (except for intranet apps).

we can add a custom validator on the JS side.

### @github-actions - 2024-09-02T02:30:24Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-02T02:30:24Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:37:09Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:37:10Z @github-actions closed this issue

