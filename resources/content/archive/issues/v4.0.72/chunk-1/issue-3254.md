---
id: 3254
title: 'buildScripts/createClass: automatically figure out the best fitting base class'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-07-03T22:25:37Z'
updatedAt: '2022-07-15T13:46:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3254'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-15T13:46:07Z'
---
# buildScripts/createClass: automatically figure out the best fitting base class

we need to add multiple (async?) `inquirer.prompt()` calls to work with the given answers before a user can ask the next questions.

after entering the desired className, the program can then figure out the best matching base class:
1. className includes `.model.` => data.Model
2. className includes `.store.` => data.Store
3. className ends with Model => model.Component
4. className ends with Controller => controller.Component
5. default to container.Base

## Timeline

- 2022-07-03T22:25:37Z @tobiu added the `enhancement` label
- 2022-07-15T13:46:00Z @tobiu referenced in commit `022f4f2` - "buildScripts/createClass: automatically figure out the best fitting base class #3254"
- 2022-07-15T13:46:07Z @tobiu closed this issue

