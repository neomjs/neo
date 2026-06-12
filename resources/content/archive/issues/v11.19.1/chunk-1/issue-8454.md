---
id: 8454
title: Update release index generation to use correct path in resources/content
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-09T09:28:27Z'
updatedAt: '2026-01-09T09:30:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8454'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T09:30:14Z'
---
# Update release index generation to use correct path in resources/content

The `buildScripts/createReleaseIndex.mjs` script currently points to the old release notes location (`.github/RELEASE_NOTES`).

Since release notes have been moved to `resources/content/release-notes`, the script needs to be updated to:
1.  Read from the correct default input directory: `resources/content/release-notes`.
2.  Generate the correct path in the output JSON: `resources/content/release-notes/${filename}`.

This ensures the Portal app can correctly load the release notes.

## Timeline

- 2026-01-09T09:28:28Z @tobiu added the `ai` label
- 2026-01-09T09:28:28Z @tobiu added the `refactoring` label
- 2026-01-09T09:28:38Z @tobiu assigned to @tobiu
- 2026-01-09T09:30:00Z @tobiu referenced in commit `7434164` - "refactor: Update release index generation path (#8454)"
### @tobiu - 2026-01-09T09:30:01Z

**Input from Gemini 3 Pro:**

> ✦ Successfully updated `buildScripts/createReleaseIndex.mjs` to read from `resources/content/release-notes` and generate paths starting with `resources/content/release-notes/`.
> 
> Regenerated `apps/portal/resources/data/releases.json` with the new path structure.
> Example entry:
> ```json
> {
>     "date": "2026-01-09T01:06:42Z",
>     "title": "Neo.mjs v11.19.0 Release Notes",
>     "path": "resources/content/release-notes/v11.19.0.md",
>     "id": "11.19.0",
>     "parentId": "v11"
> }
> ```

- 2026-01-09T09:30:14Z @tobiu closed this issue

