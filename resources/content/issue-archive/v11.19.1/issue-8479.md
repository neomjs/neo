---
id: 8479
title: Wrap Markdown images in scrollable container
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T17:59:29Z'
updatedAt: '2026-01-09T18:14:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8479'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T18:14:41Z'
---
# Wrap Markdown images in scrollable container

Images in Markdown component can overflow the container, overlapping the side navigation in Portal.
We need to wrap images in a container with `overflow-x: auto` to allow scrolling.
This involves:
1. Configuring `marked` renderer in `src/component/Markdown.mjs`.
2. Adding styles to `resources/scss/src/component/Markdown.scss`.

## Timeline

- 2026-01-09T17:59:30Z @tobiu added the `bug` label
- 2026-01-09T17:59:30Z @tobiu added the `ai` label
- 2026-01-09T18:14:17Z @tobiu referenced in commit `d2d6efa` - "fix: Wrap all Markdown images in scrollable container (#8479)"
- 2026-01-09T18:14:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T18:14:23Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `src/component/Markdown.mjs` to wrap all images (standard Markdown and raw HTML) in a `.neo-markdown-image-wrapper` div using regex post-processing on the parsed HTML.
> Added SCSS to `resources/scss/src/component/Markdown.scss` to handle `overflow-x: auto` for the wrapper.
> Verified that images are now correctly wrapped and scrollable.

- 2026-01-09T18:14:41Z @tobiu closed this issue

