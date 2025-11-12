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
closedAt: '2025-11-11T17:29:38Z'
---
# Enhance Release Preparation: Auto-update `datePublished` in `index.html`

**Reported by:** @tobiu on 2025-11-11

---

**Parent Issue:** #7446 - Enhance SEO for Neo.mjs Website

---

The `buildScripts/prepareRelease.mjs` script has been enhanced to automatically update the `datePublished` field within the `ld+json` structured data located in `apps/portal/index.html`.

**Purpose of the Change:**
This enhancement ensures that the SEO metadata for the website's publication date is always current with each new release. By automating this update, we improve the accuracy and relevance of our search engine indexing, contributing to better SEO performance.

**Context:**
This task was completed as part of the broader SEO enhancement epic, aiming to improve the discoverability and ranking of the Neo.mjs website.

**Acceptance Criteria:**
-   When `buildScripts/prepareRelease.mjs` is executed, the `datePublished` field in `apps/portal/index.html` is updated to the current date in `YYYY-MM-DD` format.
-   The script executes without errors and logs the update.

