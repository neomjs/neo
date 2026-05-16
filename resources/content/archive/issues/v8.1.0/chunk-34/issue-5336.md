---
id: 5336
title: 'Portal.view.home.MainContainer: logo excluded from the scroll area'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - mxmrtns
createdAt: '2024-03-14T09:07:05Z'
updatedAt: '2024-09-12T02:28:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5336'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:02Z'
---
# Portal.view.home.MainContainer: logo excluded from the scroll area

a weird CSS issue. @mxmrtns assigned it to you, in case you have an idea. if not, i can dig into it.

in short: i added 3 content boxes and enabled `overflow-y: scroll`. scrolling down to see further content at the bottom works fine.
<img width="1014" alt="Screenshot 2024-03-14 at 10 03 25" src="https://github.com/neomjs/neo/assets/1177434/4ddf4b4f-c546-4d2c-beb0-1e42d096fdaf">

scrolling to the top however does not:
<img width="1012" alt="Screenshot 2024-03-14 at 10 03 53" src="https://github.com/neomjs/neo/assets/1177434/b96ecbbc-2b44-4343-ac36-d95332172772">

in case there is no clean solution, we could just nest the logo into another div tag with a fixed height.

## Timeline

- 2024-03-14T09:07:05Z @tobiu added the `enhancement` label
- 2024-03-14T09:07:06Z @tobiu assigned to @mxmrtns
### @github-actions - 2024-08-29T02:25:27Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:28Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:02Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:02Z @github-actions closed this issue

