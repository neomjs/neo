---
id: 721
title: 'doc comments: private VS protected'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
assignees: []
createdAt: '2020-06-14T15:34:17Z'
updatedAt: '2020-06-21T15:03:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/721'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-21T15:03:02Z'
---
# doc comments: private VS protected

so far i have sticked to "private" for pretty much everything which should not get used.

it would be more clear and correct to replace a big part of them with "protected".

sticking to the definition:
1. private: only used inside the same class
2. protected: only used inside the same class as well as classes extending this one

e.g. afterSetX methods are obviously meant to get overridden with super class calls.

since there are 100s of items, help on this one would be appreciated.

## Timeline

- 2020-06-14T15:34:17Z @tobiu added the `enhancement` label
- 2020-06-14T15:34:17Z @tobiu added the `help wanted` label
- 2020-06-14T15:34:17Z @tobiu added the `good first issue` label
### @tobiu - 2020-06-15T06:59:15Z

it actually might be a good start to just replace **all** occurrences of @private with @protected. 

- 2020-06-20T17:18:45Z @tobiu referenced in commit `9b94c7a` - "doc comments: private VS protected #721"
- 2020-06-20T17:26:33Z @tobiu referenced in commit `4168d21` - "#721 adjusted the docs app to display protected members"
- 2020-06-21T15:03:02Z @tobiu closed this issue

