---
id: 5831
title: 'npx addon choices:    "Navigator"  --> "Navigator (list navigation)"'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-08-26T22:13:42Z'
updatedAt: '2024-10-12T17:12:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5831'
author: gplanansky
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-12T17:12:41Z'
---
# npx addon choices:    "Navigator"  --> "Navigator (list navigation)"

**Problem:  a gotcha for new users**, who:
(a) are doing a todoList example or otherwise using src/list/Base.mjs , 
(b) create a  new workspace with`npx neo-app`, and  ...
(c) ... **deselect** the "Navigator" addon choice

Why might users deselect Navigator?  Because they don't know it's needed.

**Suggestion:   annotate the npx choices with hints of what the addons do.**   

Obviously a GoogleMaps addon speaks for itself.   

But what is "Navigator"?     a library for sailors?   for doing breadcrumbs?  How about using key presses for hopping around menus?  
Whatever else, without the addon list.Base.afterSetMounted breaks.
It is not obvious, so a hint would be helpful.

note in passing:   PR https://github.com/neomjs/neo/pull/5181 , being  6.10.10 --> 6.10.11 ,  gives no hint of introducing breaking changes.

## Timeline

- 2024-08-26T22:13:42Z @gplanansky added the `enhancement` label
### @tobiu - 2024-10-12T17:12:41Z

hi george, i guess we can close this ticket now => https://github.com/neomjs/neo/issues/6028

we could use a new ticket for a guide inside the learning section, which describes the addon choices and how to add them.

- 2024-10-12T17:12:42Z @tobiu closed this issue

