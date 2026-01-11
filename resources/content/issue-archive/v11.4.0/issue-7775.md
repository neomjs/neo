---
id: 7775
title: 'feat(seo): Add Priorities to Sitemap Generation'
state: CLOSED
labels:
  - enhancement
  - good first issue
  - ai
assignees:
  - tobiu
createdAt: '2025-11-15T09:06:35Z'
updatedAt: '2025-11-15T09:41:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7775'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-15T09:41:42Z'
---
# feat(seo): Add Priorities to Sitemap Generation

Currently, the sitemap generated for the neo.mjs website does not include priority information for the URLs. This makes it harder for search engines to understand the relative importance of different pages.

This task involves updating the `buildScripts/generateSeoFiles.mjs` script to add `<priority>` tags to the generated `sitemap.xml`.

- A `PRIORITIES` map will be introduced to define custom priorities for specific routes.
- High-value pages like the Codebase Overview, tutorials, and fundamental guides will be assigned higher priorities (e.g., 0.8 to 1.0).
- A default priority of 0.5 will be used for all other pages, and the `<priority>` tag will be omitted for these to keep the sitemap clean, as per SEO best practices.


## Timeline

- 2025-11-15T09:06:36Z @tobiu added the `enhancement` label
- 2025-11-15T09:06:36Z @tobiu added the `good first issue` label
- 2025-11-15T09:06:36Z @tobiu added the `ai` label
- 2025-11-15T09:08:07Z @tobiu assigned to @tobiu
- 2025-11-15T09:11:08Z @tobiu referenced in commit `0d41184` - "#7775 logic to apply prios and first draft items"
- 2025-11-15T09:41:10Z @tobiu referenced in commit `d4f703f` - "#7775 final version"
- 2025-11-15T09:41:42Z @tobiu closed this issue

