---
id: 7447
title: Fix Root Domain SEO with Base-Href-Patched Index
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:08:08Z'
updatedAt: '2025-11-12T13:57:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7447'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-12T13:57:32Z'
---
# Fix Root Domain SEO with Base-Href-Patched Index

The project's root domain (`neomjs.com`) currently uses a meta refresh, which is detrimental to SEO as it provides no content for crawlers at the most important URL.

To fix this within the constraints of GitHub Pages hosting and the need to preserve the repository's file structure for the live IDE, we will modify the deployment process.

## Acceptance Criteria

1.  The build/deployment script needs to be modified.
2.  Instead of creating a redirect file, the script must **copy** the production portal app's `index.html` (`/dist/production/apps/portal/index.html`) to the repository root (`/index.html`).
3.  The script must then **inject a `<base>` tag** into the `<head>` of this new root `index.html` file.
    -   The tag should be: `<base href="/dist/production/apps/portal/">`
4.  The outcome should be tested thoroughly to ensure:
    -   Visiting `neomjs.com` directly serves the portal app.
    -   All application assets (JS, CSS, workers) load correctly.
    -   Other top-level paths (e.g., `/apps/covid/`, `/examples/`) remain accessible and functional.

## Comments

### @tobiu - 2025-11-11 18:30

detaching the ticket from the epic, since we can not resolve it inside this repo.

### @tobiu - 2025-11-12 13:57

resolved via: https://github.com/neomjs/pages/blob/main/buildScripts/enhanceSeo.mjs

## Activity Log

- 2025-10-10 @tobiu assigned to @tobiu
- 2025-10-10 @tobiu added the `enhancement` label
- 2025-10-10 @tobiu added parent issue #7446
- 2025-10-10 @tobiu added the `ai` label
- 2025-11-11 @tobiu removed parent issue #7446
- 2025-11-12 @tobiu closed this issue

