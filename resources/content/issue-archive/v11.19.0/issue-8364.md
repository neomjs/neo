---
id: 8364
title: Update generateSeoFiles.mjs for Portal News & Application Engine Branding
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-06T15:22:54Z'
updatedAt: '2026-01-06T15:32:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8364'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T15:32:24Z'
---
# Update generateSeoFiles.mjs for Portal News & Application Engine Branding

Update `buildScripts/generateSeoFiles.mjs` to reflect the new "Application Engine" branding in `llms.txt` and integrate the newly generated release notes JSON index.

Key Changes:
1.  **Rebranding:** Update the `llms.txt` header to describe Neo.mjs as an "Application Engine" with "Neural Link" capabilities.
2.  **News Section:** Rename `/blog` to `/news` in top-level routes and boost its priority.
3.  **Release Notes Integration:** In `getLlmsTxt`, parse the `apps/portal/resources/data/releases.json` file (if present) and inject the top 5 latest releases into the `llms.txt` output under a "Latest Updates" section.
4.  **Priority Updates:** Boost priority for high-value content (AI, Config System, etc.).


## Timeline

- 2026-01-06T15:22:55Z @tobiu added the `documentation` label
- 2026-01-06T15:22:55Z @tobiu added the `enhancement` label
- 2026-01-06T15:22:56Z @tobiu added the `ai` label
- 2026-01-06T15:22:56Z @tobiu added the `build` label
- 2026-01-06T15:23:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-06T15:32:24Z

resolved via https://github.com/neomjs/neo/commit/9f8d38aa2f46e9e4e7cd1a4adb2b01446407c915

- 2026-01-06T15:32:24Z @tobiu closed this issue

