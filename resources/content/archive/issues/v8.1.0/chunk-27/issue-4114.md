---
id: 4114
title: 'form.field.Color: listConfig => @config values are not getting applied properly'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-21T11:03:35Z'
updatedAt: '2023-02-21T12:35:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4114'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-21T12:35:48Z'
---
# form.field.Color: listConfig => @config values are not getting applied properly

not 100% sure if this one is a regression issue or just slipped through somehow.

<img width="679" alt="Screenshot 2023-02-21 at 12 01 57" src="https://user-images.githubusercontent.com/1177434/220327732-b373f48f-d7b3-42ca-88cc-803794b0a16d.png">


## Timeline

- 2023-02-21T11:03:35Z @tobiu added the `bug` label
- 2023-02-21T11:03:36Z @tobiu assigned to @tobiu
- 2023-02-21T12:31:00Z @tobiu referenced in commit `062fc25` - "form.field.Color: listConfig => @config values are not getting applied properly #4114"
### @tobiu - 2023-02-21T12:35:48Z

core.Base: parseItemConfigs() => the Object.hasOwn() check was too restrictive => we want to also enable proto configs up the hierarchy & instance configs.

- 2023-02-21T12:35:48Z @tobiu closed this issue

