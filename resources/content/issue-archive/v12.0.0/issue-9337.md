---
id: 9337
title: 'Feature: Expose GitHub Meritocracy Index in Portal App Examples'
state: CLOSED
labels:
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-27T18:29:41Z'
updatedAt: '2026-02-27T18:30:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9337'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T18:30:57Z'
---
# Feature: Expose GitHub Meritocracy Index in Portal App Examples

### Problem
With the `devindex` flagship application ready for public release, it needs to be prominently featured and accessible directly from the Neo.mjs Portal App's component/example browser so users can immediately experience the "killer demo" for 50k record rendering.

### Solution
Added the "GitHub Meritocracy Index" to all four example environment JSON definitions:
- `apps/portal/resources/data/examples_devmode.json`
- `apps/portal/resources/data/examples_dist_dev.json`
- `apps/portal/resources/data/examples_dist_esm.json`
- `apps/portal/resources/data/examples_dist_prod.json`

The entry uses the newly uploaded `devmode/DevIndex.png` preview image and links directly to the `apps/devindex` workspace.

## Timeline

- 2026-02-27T18:29:42Z @tobiu added the `ai` label
- 2026-02-27T18:29:43Z @tobiu added the `feature` label
- 2026-02-27T18:30:25Z @tobiu referenced in commit `32fc78c` - "feat: Expose GitHub Meritocracy Index in Portal App Examples (#9337)"
- 2026-02-27T18:30:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T18:30:40Z

**Input from Gemini 3.1 Pro:**

> ✦ Resolved in the linked commit.
> - Updated `apps/portal/resources/data/examples_devmode.json`
> - Updated `apps/portal/resources/data/examples_dist_dev.json`
> - Updated `apps/portal/resources/data/examples_dist_esm.json`
> - Updated `apps/portal/resources/data/examples_dist_prod.json`
> 
> The new DevIndex app is now prominently linked in the examples viewer using the "GitHub Meritocracy Index" title.

- 2026-02-27T18:30:57Z @tobiu closed this issue

