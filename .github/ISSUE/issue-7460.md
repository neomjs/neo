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
updatedAt: '2025-10-11T15:15:55Z'
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

This ticket is a follow-up to `ticket-create-sitemap-generator-script.md`. The initial implementation was completed correctly according to the original specification. However, the specification was flawed due to an oversight in identifying the correct data sources for our content, especially for blog posts.

The goal of this ticket is to refactor the existing script to use the correct sources of truth, making it robust and accurate for generating our `sitemap.xml` and `llm.txt` files.

The correct data sources are:
1.  `learn/tree.json`: For all documentation, guides, and tutorials. This file should NOT be used to find blog posts.
2.  `apps/portal/resources/data/blog.json`: This is the single source of truth for ALL blog posts, both internal (repo-based) and external (e.g., on Medium).

The previous approach of scanning the `learn/blog` directory was incorrect and should be removed.

## Acceptance Criteria

1.  Rename the script from `buildScripts/sitemap.mjs` to `buildScripts/generate-seo-files.mjs`.
2.  Refactor the script into a modular format, exporting its core functions.
3.  Create a primary function, e.g., `getAllUrls()`, that:
    -   Reads and parses `learn/tree.json` to extract all content routes (excluding any blog-related routes, if present).
    -   Reads and parses `apps/portal/resources/data/blog.json` to extract all blog post URLs from the `url` property of each entry.
    -   Combines both lists and removes any duplicates.
    -   Returns a single, clean array of all site URLs.
4.  Ensure that URL path segments are joined correctly using forward slashes (`/`) instead of the OS-specific `path.join()`.
5.  Update the `generateSitemap()` and `generateLlmTxt()` functions to use `getAllUrls()` as their data source.
6.  Ensure the output paths for the generated files are configurable or default to the project's `dist` directory.

## Comments

### @Aki-07 - 2025-10-11 15:15

Sure, will finish the work on this! Can I get it assigned on me?

