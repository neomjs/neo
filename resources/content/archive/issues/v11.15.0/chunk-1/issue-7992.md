---
id: 7992
title: Centralize sanitizeInput logic in buildScripts/util/Sanitizer.mjs
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-02T17:45:35Z'
updatedAt: '2025-12-02T17:49:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7992'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T17:49:24Z'
---
# Centralize sanitizeInput logic in buildScripts/util/Sanitizer.mjs

To avoid code duplication and improve maintainability, we should centralize the `sanitizeInput` logic used for `commander` options.

**Tasks:**
1.  Create a new file `buildScripts/util/Sanitizer.mjs`.
2.  Export the `sanitizeInput` function from this file.
3.  Update `buildScripts/buildAll.mjs` to import and use this shared function.

**Rationale:**
This ensures consistent input sanitization across all build scripts and allows for future logic updates in a single location.

**Function Logic:**
```javascript
export const sanitizeInput = value => {
    if (typeof value === 'string') {
        return value.replace(/^["']|["']$/g, '').trim();
    }
    return value;
};
```

## Timeline

- 2025-12-02T17:45:36Z @tobiu added the `enhancement` label
- 2025-12-02T17:45:36Z @tobiu added the `ai` label
- 2025-12-02T17:45:37Z @tobiu added the `refactoring` label
- 2025-12-02T17:47:49Z @tobiu assigned to @tobiu
- 2025-12-02T17:48:33Z @tobiu referenced in commit `d46336d` - "Centralize sanitizeInput logic in buildScripts/util/Sanitizer.mjs #7992"
### @tobiu - 2025-12-02T17:48:55Z

**Input from Gemini Agent:**

> ✦ I have successfully centralized the `sanitizeInput` logic.
> - Created `buildScripts/util/Sanitizer.mjs`.
> - Updated `buildScripts/buildAll.mjs` to import the function instead of defining it locally.
> 
> This resolves the immediate need for `buildAll.mjs` and prepares the utility for use in other build scripts.

- 2025-12-02T17:49:24Z @tobiu closed this issue

