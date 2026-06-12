---
id: 3119
title: SCSS file watcher
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-05-31T17:21:35Z'
updatedAt: '2022-06-07T14:24:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3119'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-07T14:24:46Z'
---
# SCSS file watcher

this topic came up frequently and should get a high priority.

currently, each scss file change requires `npm run build-themes`. we can limit it to dev mode and use css vars, but this is still too slow.

for a file-watcher, we will most likely need to stick to the css vars based env, but this seems fair (we can switch to the other mode once done).

## Timeline

- 2022-05-31T17:21:35Z @tobiu added the `enhancement` label
### @tobiu - 2022-06-01T13:48:47Z

we can not use scss -watch:
https://sass-lang.com/guide

since this is just a small part of our logic.

this one looks perfect though:
https://nodejs.org/docs/latest/api/fs.html#fswatchfilename-options-listener

- 2022-06-03T15:11:05Z @tobiu referenced in commit `9c4b45d` - "SCSS file watcher #3119: basic folder tree watcher setup"
- 2022-06-03T23:20:16Z @tobiu referenced in commit `82fdae4` - "SCSS file watcher #3119: scss build (in progress, not stable)"
- 2022-06-03T23:20:48Z @tobiu referenced in commit `25ce601` - "SCSS file watcher #3119: button test cleanup"
- 2022-06-07T14:24:30Z @tobiu referenced in commit `01d8b25` - "SCSS file watcher #3119"
- 2022-06-07T14:24:46Z @tobiu closed this issue

