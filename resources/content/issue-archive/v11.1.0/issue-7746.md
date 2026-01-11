---
id: 7746
title: 'Enhance Release Preparation: Auto-update `datePublished` in `index.html`'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-11T17:26:47Z'
updatedAt: '2025-11-11T17:29:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7746'
author: tobiu
commentsCount: 0
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T17:29:38Z'
---
# Enhance Release Preparation: Auto-update `datePublished` in `index.html`

The `buildScripts/prepareRelease.mjs` script has been enhanced to automatically update the `datePublished` field within the `ld+json` structured data located in `apps/portal/index.html`.

**Purpose of the Change:**
This enhancement ensures that the SEO metadata for the website's publication date is always current with each new release. By automating this update, we improve the accuracy and relevance of our search engine indexing, contributing to better SEO performance.

**Context:**
This task was completed as part of the broader SEO enhancement epic, aiming to improve the discoverability and ranking of the Neo.mjs website.

**Acceptance Criteria:**
-   When `buildScripts/prepareRelease.mjs` is executed, the `datePublished` field in `apps/portal/index.html` is updated to the current date in `YYYY-MM-DD` format.
-   The script executes without errors and logs the update.

## Timeline

- 2025-11-11T17:26:47Z @tobiu assigned to @tobiu
- 2025-11-11T17:26:48Z @tobiu added the `enhancement` label
- 2025-11-11T17:26:48Z @tobiu added the `ai` label
- 2025-11-11T17:29:14Z @tobiu referenced in commit `2badb6a` - "Enhance Release Preparation: Auto-update datePublished in index.html #7746"
- 2025-11-11T17:29:29Z @tobiu added parent issue #7446
- 2025-11-11T17:29:39Z @tobiu closed this issue

