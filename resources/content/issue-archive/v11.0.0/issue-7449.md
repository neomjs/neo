---
id: 7449
title: Create Sitemap & LLM.txt Generator Script
state: CLOSED
labels:
  - enhancement
  - hacktoberfest
  - ai
assignees:
  - Aki-07
createdAt: '2025-10-10T20:10:51Z'
updatedAt: '2025-10-11T09:43:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7449'
author: tobiu
commentsCount: 3
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-11T09:43:51Z'
---
# Create Sitemap & LLM.txt Generator Script

To ensure our SEO files (`sitemap.xml`, `llm.txt`) are always up-to-date with the site's content, we need to automate their generation. Manually maintaining these files is not sustainable.

This task is to create a new build script responsible for parsing our content manifests and generating the necessary data for these SEO files.

## Acceptance Criteria

1.  Create a new build script at `buildScripts/generate-seo-files.mjs`.
2.  The script must read and parse `learn/tree.json` to extract all content routes.
3.  It should also be able to scan the `learn/blog` directory to find any blog posts that may not be in the `tree.json` file.
4.  The script should compile a comprehensive list of all valid content URLs.
5.  It should expose methods that can be used by other functions to get this URL list in different formats (e.g., as a simple array, or formatted for XML or `llm.txt`).

## Timeline

- 2025-10-10 @tobiu assigned to @tobiu
- 2025-10-10 @tobiu added parent issue #7446
- 2025-10-10 @tobiu added the `enhancement` label
- 2025-10-10 @tobiu added the `ai` label
### @Aki-07 - 2025-10-10 20:51

Love to work on this please do assign me 

- 2025-10-10 @tobiu unassigned from @tobiu
- 2025-10-10 @tobiu assigned to @Aki-07
- 2025-10-10 @tobiu added the `hacktoberfest` label
### @tobiu - 2025-10-10 21:14

sure, assigned. thought seo was not compelling to most, so i did not flag it with hacktoberfest initially.

i will look into your PR tomorrow, this was a long day, and i need a fresh head again first :)

- 2025-10-11 @Aki-07 cross-referenced by PR #7456
### @Aki-07 - 2025-10-11 04:33

No worries, please do review it in your free time and since 3 issues were coupled, had to create one PR solving all the three

- 2025-10-11 @tobiu closed this issue

