# Ticket: Create LLM.txt for AI Content Understanding

GH ticket id: #ISSUENUMBER

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-enhance-neo-website-seo.md

## Description

To improve the ability of Large Language Models (LLMs) to understand and index the content of the Neo.mjs website, an `LLM.txt` file should be created in the `docs` root directory. This file will serve as a guide for AI crawlers, similar to how `robots.txt` guides traditional search engine crawlers.

## Acceptance Criteria

1.  Create a new file named `LLM.txt` in the `/docs` directory.
2.  The file should specify the user-agent for all LLMs (`User-agent: *`).
3.  It should explicitly allow access to the `/learn/` and `/blog/` directories, as these contain the primary content we want indexed.
4.  It should disallow access to other directories that are not relevant for content indexing (e.g., `/app/`, `/resources/`).
