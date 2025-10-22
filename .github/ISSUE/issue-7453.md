---
id: 7453
title: Update robots.txt for SEO
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:20:28Z'
updatedAt: '2025-10-10T20:20:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7453'
author: tobiu
commentsCount: 0
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Update robots.txt for SEO

**Reported by:** @tobiu on 2025-10-10

---

**Parent Issue:** #7446 - Enhance SEO for Neo.mjs Website

---

The `robots.txt` file gives instructions to web crawlers about which pages they can or cannot crawl. It should also point to the location of our sitemap.

## Acceptance Criteria

1.  Create or update the `robots.txt` file in the `apps/portal/` directory.
2.  Ensure the file includes a `Sitemap:` directive pointing to the absolute URL of the `sitemap.xml` file (e.g., `Sitemap: https://neomjs.com/sitemap.xml`).
3.  Optionally, this process can be automated as part of the `generate-seo-files.mjs` build script.

