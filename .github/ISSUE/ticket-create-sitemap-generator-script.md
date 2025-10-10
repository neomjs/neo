# Ticket: Create Sitemap & LLM.txt Generator Script

GH ticket id: #7449

**Assignee:** tobiu
**Status:** To Do

**Parent Epic:** epic-enhance-neo-website-seo.md

## Description

To ensure our SEO files (`sitemap.xml`, `llm.txt`) are always up-to-date with the site's content, we need to automate their generation. Manually maintaining these files is not sustainable.

This task is to create a new build script responsible for parsing our content manifests and generating the necessary data for these SEO files.

## Acceptance Criteria

1.  Create a new build script at `buildScripts/generate-seo-files.mjs`.
2.  The script must read and parse `learn/tree.json` to extract all content routes.
3.  It should also be able to scan the `learn/blog` directory to find any blog posts that may not be in the `tree.json` file.
4.  The script should compile a comprehensive list of all valid content URLs.
5.  It should expose methods that can be used by other functions to get this URL list in different formats (e.g., as a simple array, or formatted for XML or `llm.txt`).
