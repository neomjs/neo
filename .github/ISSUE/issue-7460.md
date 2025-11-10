---
id: 7460
title: Refactor SEO Generator Script with Correct Data Sources
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-11T09:36:00Z'
updatedAt: '2025-11-10T20:53:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7460'
author: tobiu
commentsCount: 1
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Refactor SEO Generator Script with Correct Data Sources

**Reported by:** @tobiu on 2025-10-11

---

**Parent Issue:** #7446 - Enhance SEO for Neo.mjs Website

---

This ticket is a follow-up to `ticket-create-sitemap-generator-script.md`. The initial implementation was completed correctly according to the original specification. However, the specification was flawed due to an oversight in identifying the correct data sources for our content.

The goal of this ticket is to refactor the existing script to use the correct source of truth, making it robust and accurate for generating our `sitemap.xml` and `llm.txt` files.

**The correct data source is:**
1.  `learn/tree.json`: This is the single source of truth for ALL internal content, including documentation, guides, tutorials, and internally-hosted blog posts.

The `apps/portal/resources/data/blog.json` file is for presentation purposes on the website and should be ignored for sitemap generation. The approach of scanning the `learn/blog` directory is also incorrect.

## Acceptance Criteria

1.  Rename the script from `buildScripts/sitemap.mjs` to `buildScripts/generate-seo-files.mjs`.
2.  Refactor the script to ensure it uses `learn/tree.json` as the **single source of truth** for all internal URLs.
3.  Remove any logic that reads from `apps/portal/resources/data/blog.json` or scans the `learn/blog` directory.
4.  The script should export a primary function, e.g., `getContentUrls({baseUrl})`, that returns a clean, absolute array of all internal site URLs.
5.  Ensure that URL path segments are joined correctly using forward slashes (`/`).
6.  Update the `generateSitemap()` and `generateLlmTxt()` functions to use this corrected data source.

## Comments

### @Aki-07 - 2025-10-11 15:15

Sure, will finish the work on this! Can I get it assigned on me?

