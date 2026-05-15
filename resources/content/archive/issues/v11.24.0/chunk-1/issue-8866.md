---
id: 8866
title: Fix release script regex for Portal Footer version update
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-23T11:14:33Z'
updatedAt: '2026-01-23T11:19:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8866'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-23T11:19:58Z'
---
# Fix release script regex for Portal Footer version update

The regex in `buildScripts/release/prepare.mjs` (lines 87-96) fails to correctly update the version number in `apps/portal/view/home/FooterContainer.mjs` due to a recent change in the footer's text format. The footer now includes copyright and license info ('© 2026 Neo.mjs • v11.22.0 • MIT License'), which the old regex (`/'\w.+'/'`) would clobber.

**Solution:**
Update the regex to target specifically the `vX.Y.Z` pattern instead of replacing the entire string.

## Timeline

- 2026-01-23T11:14:34Z @tobiu added the `bug` label
- 2026-01-23T11:14:34Z @tobiu added the `ai` label
- 2026-01-23T11:14:34Z @tobiu added the `build` label
- 2026-01-23T11:19:00Z @tobiu referenced in commit `d8e5e2c` - "fix: Update release script regex and use dynamic year in Portal footer (#8866)"
- 2026-01-23T11:19:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-23T11:19:28Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the regex in `buildScripts/release/prepare.mjs` to correctly target the `vX.Y.Z` pattern, preventing it from overwriting the entire text content.
> 
> Additionally, I updated `apps/portal/view/home/FooterContainer.mjs` to use a dynamic date for the copyright year (`new Date().getFullYear()`) and converted the string to a template literal. The release script was verified to correctly update the version number within this new format.
> 
> Generated SEO metadata and release index files have also been updated and pushed.

- 2026-01-23T11:19:59Z @tobiu closed this issue

