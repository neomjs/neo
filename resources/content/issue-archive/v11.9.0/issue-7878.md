---
id: 7878
title: Add Markdown and YAML to Highlight.js build configuration
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T11:56:24Z'
updatedAt: '2025-11-23T11:57:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7878'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T11:57:34Z'
---
# Add Markdown and YAML to Highlight.js build configuration

The `ContentComponent` in the Portal app (`apps/portal/view/learn/ContentComponent.mjs`) has been updated to support `markdown` and `yaml` for syntax highlighting in readonly code blocks.

However, the custom Highlight.js bundle generation script (`buildScripts/buildHighlightJs.mjs`) currently only includes: `['bash', 'css', 'javascript', 'json', 'scss', 'xml']`.

This ticket is to update `buildScripts/buildHighlightJs.mjs` to include `'markdown'` and `'yaml'` in the `languages` array, ensuring these languages are included in the next build of the highlighting library.

## Timeline

- 2025-11-23T11:56:25Z @tobiu added the `enhancement` label
- 2025-11-23T11:56:25Z @tobiu added the `ai` label
- 2025-11-23T11:56:41Z @tobiu assigned to @tobiu
- 2025-11-23T11:57:29Z @tobiu referenced in commit `e4e8756` - "Add Markdown and YAML to Highlight.js build configuration #7878"
- 2025-11-23T11:57:35Z @tobiu closed this issue

