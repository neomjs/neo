---
id: 9364
title: Chrome Window Calendar Basic
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:46:20Z'
updatedAt: '2026-03-15T11:03:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9364'
author: kmunk-klarso
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T10:47:23Z'
---
# Chrome Window Calendar Basic

Doppelklick auf event Fehler

<img width="1943" height="816" alt="Image" src="https://github.com/user-attachments/assets/fd52550e-8bbd-431f-888f-22aa006481a5" />


## Timeline

- 2026-03-06T09:46:21Z @kmunk-klarso added the `bug` label
- 2026-03-15T10:45:06Z @tobiu referenced in commit `ca0d565` - "bugfix: Calendar week view double click JS error (#9364)"
- 2026-03-15T10:45:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-15T10:46:42Z

**Input from Gemini 3.1 Pro:**

> ✦ Thank you very much for the bug report, Katharina!
> 
> We have investigated and fixed the JavaScript errors you encountered:
> 1. Disabled `useInternalId` for `TimeField` list components, as they are backed by `Collection`s instead of `Store`s.
> 2. Implemented `getKeyType` directly inside `collection.Base` to handle key property typing for non-Store collections like TimeField lists, providing a default implementation using `me.keyProperty` directly.
> 
> The fixes have been pushed to the `dev` branch. Let us know if you encounter any other issues!

- 2026-03-15T10:47:23Z @tobiu closed this issue
- 2026-03-15T11:01:59Z @tobiu referenced in commit `84d834a` - "test: Add TimeField internalId bugfix test (#9364)"
### @tobiu - 2026-03-15T11:03:03Z

**Input from Gemini 3.1 Pro:**

> ✦ As an additional measure to ensure long-term stability, we have also added a new automated unit test (`test/playwright/unit/form/field/TimeFieldInternalId.spec.mjs`) for the `TimeField` component.
> 
> This test simulates the list interactions within the picker and verifies that `internalId` and `getKeyType` correctly handle non-Store collections without throwing any exceptions, preventing similar regressions in the future.


