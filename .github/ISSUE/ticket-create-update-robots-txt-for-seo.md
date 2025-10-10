# Ticket: Update robots.txt for SEO

GH ticket id: #7453

**Assignee:** tobiu
**Status:** To Do

**Parent Epic:** epic-enhance-neo-website-seo.md
**Depends On:** ticket-generate-sitemap-file.md

## Description

The `robots.txt` file gives instructions to web crawlers about which pages they can or cannot crawl. It should also point to the location of our sitemap.

## Acceptance Criteria

1.  Create or update the `robots.txt` file in the `apps/portal/` directory.
2.  Ensure the file includes a `Sitemap:` directive pointing to the absolute URL of the `sitemap.xml` file (e.g., `Sitemap: https://neomjs.com/sitemap.xml`).
3.  Optionally, this process can be automated as part of the `generate-seo-files.mjs` build script.
