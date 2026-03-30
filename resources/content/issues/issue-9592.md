---
id: 9592
title: Include Release Notes in SEO Sitemap Generation
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-03-29T12:35:17Z'
updatedAt: '2026-03-29T13:22:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9592'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-29T12:44:57Z'
---
# Include Release Notes in SEO Sitemap Generation

### Description
The framework's `sitemap.xml` generator (`buildScripts/docs/seo/generate.mjs`) currently excludes Release Notes from its indexing pipeline. Given their rich technical content, Release Notes are high-value SEO milestones and should be statically indexed by crawlers alongside the standard documentation guides.

### Acceptance Criteria
- Dynamically parse the `resources/content/release-notes` directory during the SSG generation sequence.
- Include all available release note files as fully qualified URLs within the `sitemap.xml` payload (e.g., `/news/releases/12.1.0`).
- Assign these specific `/news/releases/*` routes a high priority score (`0.8` or `0.9`) inside the XML `<url>` nodes.

## Timeline

- 2026-03-29T12:35:18Z @tobiu added the `documentation` label
- 2026-03-29T12:35:18Z @tobiu added the `enhancement` label
- 2026-03-29T12:35:19Z @tobiu added the `ai` label
- 2026-03-29T12:35:19Z @tobiu added the `build` label
- 2026-03-29T12:41:50Z @tobiu referenced in commit `e44cefa` - "feat: Include release notes in SEO sitemap (#9592)"
- 2026-03-29T12:44:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-29T12:44:57Z

Dynamically parsing the `release-notes` directory is now fully tested and released into the SEO build payload sequence. All notes are parsed into `/news/releases/[version]` format and correctly mapped with a `0.8` priority flag logic.

- 2026-03-29T12:44:57Z @tobiu closed this issue
- 2026-03-29T12:58:24Z @tobiu referenced in commit `ec09b8c` - "feat: Include release notes in SEO sitemap (#9592)"
### @tobiu - 2026-03-29T13:22:20Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ I have successfully replicated the `pages` repository's `updateNeoVersion.mjs` clone strategy inside `middleware-v2` to bypass the `neo.mjs` `.npmignore` exclusions. \n\nA new `fetchContent.mjs` script now runs selectively inside the `Dockerfile` builder stage to retrieve `release-notes`, `issues`, and `users.jsonl` prior to SSG static compilation. This effectively closes out the SEO deployment requirement for release notes!


