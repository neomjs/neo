---
id: 1467
title: 'generate-docs: single file outputs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-30T10:35:42Z'
updatedAt: '2020-11-30T11:09:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1467'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-30T11:09:40Z'
---
# generate-docs: single file outputs

related to: https://github.com/neomjs/neo/commit/89d9e999c05b65ee53b085040332b60e8f56ccf6

The Docs App itself is using:
output/all.json
output/structure.json

The generator script is also saving each class into an own file.

This can be helpful for debugging reasons, but I did not use it directly inside the docs app, since the inheritance of classes can require a lot of ajax calls otherwise.

The issue encountered by @h1b9b is that the file namespacing only worked for framework classes and not for files of demo apps (and the docs app).

I got an idea on how to fix this.

On it!

## Timeline

- 2020-11-30T10:35:42Z @tobiu added the `enhancement` label
- 2020-11-30T10:35:42Z @tobiu assigned to @tobiu
- 2020-11-30T11:09:37Z @tobiu referenced in commit `a694c96` - "generate-docs: single file outputs #1467"
- 2020-11-30T11:09:40Z @tobiu closed this issue

