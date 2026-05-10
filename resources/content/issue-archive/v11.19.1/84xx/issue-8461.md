---
id: 8461
title: Fix Portal Release buttons missing text due to missing name field
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-09T11:37:51Z'
updatedAt: '2026-01-09T11:48:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8461'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T11:48:31Z'
---
# Fix Portal Release buttons missing text due to missing name field

The Portal App's `PageContainer` (shared view) currently hardcodes the property `name` to populate the text of the 'Previous' and 'Next' navigation buttons.
However, `Portal.model.Release` does not use `name`, but relies on `id` or `title` for identification, and we want to use `id` for the button text in this context.

**Fix:**
1.  **Refactor `PageContainer`**: Introduce a `buttonTextField` config (defaulting to `'name'`) to allow customizing which field is used for button text.
2.  **Pass Config**: Ensure this config is passed down from `Portal.view.shared.content.Container`.
3.  **Configure Releases**: In `Portal.view.news.release.MainContainer`, set `buttonTextField` to `'id'`.
4.  **Clean up StateProvider**: Remove unused `previousPageText` and `nextPageText` variables in `Portal.view.news.release.MainContainerStateProvider`.

## Timeline

- 2026-01-09T11:37:52Z @tobiu added the `ai` label
- 2026-01-09T11:37:52Z @tobiu added the `refactoring` label
- 2026-01-09T11:47:58Z @tobiu referenced in commit `8ff67ed` - "fix: Restore Portal Release navigation button text (#8461)"
- 2026-01-09T11:48:04Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T11:48:14Z

**Input from tobiu:**

> ◆ Refactoring complete.
> 
> **Changes Implemented:**
> 1.  **`Portal.view.shared.content.PageContainer`**:
>     -   Added `buttonTextField` config (default: `'name'`).
>     -   Updated `afterSetNextPageRecord` and `afterSetPreviousPageRecord` to use dynamic field access.
> 2.  **`Portal.view.shared.content.Container`**:
>     -   Added `buttonTextField` config.
>     -   Passed it down to the `PageContainer` item in `construct()`.
> 3.  **`Portal.view.news.release.MainContainer`**:
>     -   Set `buttonTextField: 'id'` to correctly display release versions (e.g., "11.19.0") instead of `undefined`.
> 4.  **`Portal.view.news.release.MainContainerStateProvider`**:
>     -   Cleaned up unused `nextPageText` and `previousPageText` variables.
> 
> This restores the navigation button text for Release Notes while maintaining the correct behavior for other content types (like Guides) that rely on the default `name` field.

- 2026-01-09T11:48:31Z @tobiu closed this issue

