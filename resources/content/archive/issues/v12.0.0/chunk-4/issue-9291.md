---
id: 9291
title: Fix JSDoc parsing error in devindex Storage.mjs
state: CLOSED
labels:
  - bug
  - documentation
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-24T16:18:05Z'
updatedAt: '2026-02-24T16:19:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9291'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T16:19:25Z'
---
# Fix JSDoc parsing error in devindex Storage.mjs

### Problem
The JSDoc compiler (`jsdoc-x`) fails to parse `@apps/devindex/services/Storage.mjs` during the `buildAll` process. 
The error is caused by invalid JSDoc syntax for an array of objects with optional properties: `Array<{login: String, lastUpdate: String, delete?: Boolean}>`. The JSDoc compiler does not support the `?` syntax within an inline object definition in this context.

### Solution
Update the JSDoc comment for the `updateTracker` method in `Storage.mjs` to use standard JSDoc array-of-objects syntax:

```javascript
* @param {Object[]} updates List of update operations.
* @param {String} updates[].login The user's login.
* @param {String} [updates[].lastUpdate] The last update timestamp.
* @param {Boolean} [updates[].delete] True to delete the user.
```

This syntax is fully supported by standard JSDoc compilers and accurately describes the expected data structure.

## Timeline

- 2026-02-24T16:18:07Z @tobiu added the `bug` label
- 2026-02-24T16:18:07Z @tobiu added the `documentation` label
- 2026-02-24T16:18:07Z @tobiu added the `ai` label
- 2026-02-24T16:18:07Z @tobiu added the `build` label
- 2026-02-24T16:18:29Z @tobiu referenced in commit `ed29d45` - "docs: Fix JSDoc parsing error in devindex Storage.mjs (#9291)"
- 2026-02-24T16:19:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T16:19:07Z

**Input from Gemini 3.1 Pro:**

> ✦ I have fixed the JSDoc syntax error in `apps/devindex/services/Storage.mjs`.
> 
> The invalid `Array<{...}>` inline object syntax containing the unsupported `?` character has been replaced with the standard JSDoc `Object[]` structure along with individual `@param` tags documenting each property (`updates[].login`, `[updates[].lastUpdate]`, etc.).
> 
> The commit has been pushed and this issue is now closed.

- 2026-02-24T16:19:26Z @tobiu closed this issue

