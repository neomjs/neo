---
id: 9037
title: 'Refactor: Dynamic Year Fields in Contributor Model'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-07T19:58:01Z'
updatedAt: '2026-02-07T20:03:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9037'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T20:03:06Z'
---
# Refactor: Dynamic Year Fields in Contributor Model

Refactor `apps/devrank/model/Contributor.mjs` to dynamically generate year fields (current year down to 2010) instead of using a hardcoded list.

This approach:
1.  Ensures the model automatically includes the current year (e.g., 2026) without manual updates.
2.  Reduces boilerplate code.
3.  Mirrors the dynamic column generation logic in `GridContainer.mjs`.

**Implementation Details:**
-   Remove the hardcoded year fields from `static config.fields`.
-   Implement a dynamic generation logic (likely in `onConstructed` or a dedicated method called during class setup/init, though `Neo.data.Model` fields are usually static. For Models, we might need to stick to static definition or use a `static` block / IIFE to generate the array before assignment if we want it to be truly dynamic at load time).
-   Actually, `Neo.data.Model` processes fields in `processFields`. We can assign the fields array dynamically in the class definition itself using standard JS execution.

Example:
```javascript
const fields = [...staticFields];
const currentYear = new Date().getFullYear();
for (let i = currentYear; i >= 2010; i--) {
    fields.push({name: `y${i}`, mapping: `years.${i}`, type: 'Integer'});
}
// assign fields to config
```

## Timeline

- 2026-02-07T19:58:02Z @tobiu added the `ai` label
- 2026-02-07T19:58:02Z @tobiu added the `refactoring` label
- 2026-02-07T19:58:09Z @tobiu added parent issue #8930
- 2026-02-07T20:02:29Z @tobiu referenced in commit `f8a975d` - "refactor: Dynamic year fields in Contributor model (#9037)"
### @tobiu - 2026-02-07T20:02:36Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `Contributor` model to generate year fields dynamically.
> - Removed hardcoded year fields from `static config.fields`.
> - Added `addYearFields()` method called in `construct()` to generate fields from the current year down to 2010.
> - Added proper JSDoc comments.
> 
> Changes pushed to `dev`.

- 2026-02-07T20:02:53Z @tobiu assigned to @tobiu
- 2026-02-07T20:03:06Z @tobiu closed this issue

