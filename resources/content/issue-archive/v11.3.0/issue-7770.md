---
id: 7770
title: 'feat(seo): Use directory last modified date for examples in sitemap'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-13T22:13:41Z'
updatedAt: '2025-11-13T22:17:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7770'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T22:17:28Z'
---
# feat(seo): Use directory last modified date for examples in sitemap

### Description

The current `getSitemapXml` function in `buildScripts/generateSeoFiles.mjs` determines the `<lastmod>` date for an example by checking the git history of its `index.html` file only.

This is inaccurate because changes to other files within an example's directory (e.g., JavaScript, CSS, or resource files) do not update the `<lastmod>` date in the sitemap.

### Desired Behavior

The `<lastmod>` date for an example in `sitemap.xml` should reflect the last commit that modified *any* file within that example's directory.

### Implementation Suggestion

In `buildScripts/generateSeoFiles.mjs`, the `getSitemapXml` function should be modified. When collecting file paths to pass to `getGitLastModifiedBatch`, if a route is an example, it should pass the path to the example's parent directory (`path.dirname(filePath)`) instead of the path to the `index.html` file itself.

This will cause `git log` to find the most recent commit affecting any file in that directory, providing a more accurate timestamp.

## Timeline

- 2025-11-13T22:13:42Z @tobiu added the `enhancement` label
- 2025-11-13T22:13:43Z @tobiu added the `ai` label
- 2025-11-13T22:14:04Z @tobiu assigned to @tobiu
- 2025-11-13T22:17:15Z @tobiu referenced in commit `5a53e56` - "feat(seo): Use directory last modified date for examples in sitemap #7770"
- 2025-11-13T22:17:29Z @tobiu closed this issue

