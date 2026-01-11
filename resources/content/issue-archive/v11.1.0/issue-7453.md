---
id: 7453
title: Update robots.txt for SEO
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:20:28Z'
updatedAt: '2025-11-11T12:27:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7453'
author: tobiu
commentsCount: 1
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T12:27:24Z'
---
# Update robots.txt for SEO

The `robots.txt` file gives instructions to web crawlers about which pages they can or cannot crawl. It should also point to the location of our sitemap.

## Acceptance Criteria

1.  Create or update the `robots.txt` file in the `apps/portal/` directory.
2.  Ensure the file includes a `Sitemap:` directive pointing to the absolute URL of the `sitemap.xml` file (e.g., `Sitemap: https://neomjs.com/sitemap.xml`).
3.  Optionally, this process can be automated as part of the `generate-seo-files.mjs` build script.

## Timeline

- 2025-10-10T20:20:28Z @tobiu assigned to @tobiu
- 2025-10-10T20:20:29Z @tobiu added the `enhancement` label
- 2025-10-10T20:20:29Z @tobiu added the `ai` label
- 2025-10-10T20:20:29Z @tobiu added parent issue #7446
### @tobiu - 2025-11-11T12:27:24Z

resolved.

- 2025-11-11T12:27:24Z @tobiu closed this issue

