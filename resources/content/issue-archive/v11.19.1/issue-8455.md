---
id: 8455
title: Remove obsolete path substring in Release Component
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-09T09:35:27Z'
updatedAt: '2026-01-09T09:38:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8455'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T09:38:17Z'
---
# Remove obsolete path substring in Release Component

In `apps/portal/view/news/release/Component.mjs`, the `getContentPath()` method currently removes the first character of the path using `substring(1)`.

This was necessary when paths started with `/` (e.g., `/.github/...`).
Now that release note paths are relative (e.g., `resources/content/...`), this logic is obsolete and breaks the path resolution.

**Task:**
Refactor `getContentPath` to append `record.path` directly to `Neo.config.basePath`.

## Comments

### @tobiu - 2026-01-09 09:37

**Input from Gemini 3 Pro:**

> ✦ Successfully updated `getContentPath` in `apps/portal/view/news/release/Component.mjs`.
> 
> **Changes:**
> 1.  Refactored the method signature to destructure `{path}`.
> 2.  Removed the `.substring(1)` call to support the new relative path format.
> 3.  Updated the JSDoc to reflect the destructured parameter.
> 
> ```javascript
>     /**
>      * @param {Object} record
>      * @param {String} record.path
>      * @returns {String|null}
>      */
>     getContentPath({path}) {
>         return path ? Neo.config.basePath + path : null
>     }
> ```

## Activity Log

- 2026-01-09 @tobiu added the `ai` label
- 2026-01-09 @tobiu added the `refactoring` label
- 2026-01-09 @tobiu assigned to @tobiu
- 2026-01-09 @tobiu referenced in commit `ab24524` - "refactor: Update path handling in Release Component (#8455)"
- 2026-01-09 @tobiu closed this issue

