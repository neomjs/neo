---
id: 7744
title: 'Refactor Release Preparation Script: Rename `injectPackageVersion` to `prepareRelease` and Integrate SEO File Generation'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-11T12:05:01Z'
updatedAt: '2025-11-11T13:02:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7744'
author: tobiu
commentsCount: 0
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T13:02:33Z'
---
# Refactor Release Preparation Script: Rename `injectPackageVersion` to `prepareRelease` and Integrate SEO File Generation

The current `buildScripts/injectPackageVersion.mjs` script is responsible for updating the package version across various files during a release. This ticket proposes to refactor and enhance this script to create a more comprehensive release preparation tool.

**Proposed Changes:**

1.  **Rename Script:** Rename `buildScripts/injectPackageVersion.mjs` to `buildScripts/prepareRelease.mjs` (or a similar, more descriptive name). This new name will better reflect its expanded responsibilities.
2.  **Update `package.json`:** Modify the `package.json` scripts to use the new script name.
3.  **Integrate SEO File Generation:** Extend the functionality of the `prepareRelease.mjs` script to automatically regenerate `sitemap.xml` and `llm.txt`. This ensures that these SEO-critical files are always up-to-date with the latest content and version information as part of the release process. The script should call the relevant functions from `generate-seo-files.mjs` to perform this.

**Benefits:**
-   Streamlines the release workflow.
-   Ensures consistency and accuracy of version numbers and SEO files.
-   Reduces the risk of manual errors during release preparation.

**Acceptance Criteria:**
-   The script `buildScripts/injectPackageVersion.mjs` is renamed to `buildScripts/prepareRelease.mjs`.
-   All references to the old script name in `package.json` are updated.
-   The `prepareRelease.mjs` script successfully updates package versions and regenerates `sitemap.xml` and `llm.txt` when executed.
-   The generated `sitemap.xml` and `llm.txt` files contain the correct, canonical, hash-based URLs.

## Timeline

- 2025-11-11T12:05:01Z @tobiu assigned to @tobiu
- 2025-11-11T12:05:03Z @tobiu added the `enhancement` label
- 2025-11-11T12:05:03Z @tobiu added the `ai` label
- 2025-11-11T12:05:03Z @tobiu added the `refactoring` label
- 2025-11-11T12:06:08Z @tobiu added parent issue #7446
- 2025-11-11T12:25:05Z @tobiu referenced in commit `b466aea` - "Refactor Release Preparation Script: Rename injectPackageVersion to prepareRelease and Integrate SEO File Generation #7744"
- 2025-11-11T13:02:33Z @tobiu closed this issue

