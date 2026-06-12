---
id: 7747
title: Integrate SEO File Copying into `buildAll.mjs` for Application Builds
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-11T17:47:02Z'
updatedAt: '2025-11-11T18:12:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7747'
author: tobiu
commentsCount: 0
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T18:12:19Z'
---
# Integrate SEO File Copying into `buildAll.mjs` for Application Builds

The current build process does not automatically copy SEO-related files (`robots.txt`, `llm.txt`, `sitemap.xml`) from individual application directories into their respective build output folders (`dist/development/<app-name>/`, `dist/production/<app-name>/`). This leads to manual steps or potential oversight in ensuring these critical files are present in deployed application builds.

This ticket proposes to enhance the build process to automatically discover and copy these SEO files using a dedicated script called from `buildScripts/buildAll.mjs`.

**Proposed Changes:**

1.  **Dedicated Script for SEO Copying:**
    *   A new script, `buildScripts/copySeoFiles.mjs`, has been created to encapsulate the logic for finding application roots and copying SEO files.
    *   This script will scan the `apps/` folder (including nested structures) to identify individual application directories. A directory is considered an application directory if it contains an `index.html` file.
    *   For each identified application directory, it will check for the presence of `robots.txt`, `llm.txt`, and `sitemap.xml` in its root.

2.  **Integration into `buildAll.mjs`:**
    *   `buildScripts/buildAll.mjs` will execute `buildScripts/copySeoFiles.mjs` as a child process.
    *   The copying process should occur at the end of the `buildAll.mjs` execution, after all other build steps are complete.

**Benefits:**

-   **Automated Deployment:** Ensures that SEO files are consistently included in application builds without manual intervention.
-   **Improved SEO:** Guarantees that search engines and AI crawlers have access to the correct directives and sitemaps for each deployed application.
-   **Reduced Errors:** Eliminates the risk of forgetting to copy these files during the build or deployment process.
-   **Scalability:** Easily handles new applications added to the `apps/` folder.
-   **Modularity:** Keeps `buildAll.mjs` clean by delegating specific functionality to a dedicated script.

**Implementation Details:**

-   A new script, `buildScripts/copySeoFiles.mjs`, has been created.
-   This script contains the `findAppRoots` function (which recursively searches for `index.html` and excludes `examples/`) and the `copySeoFilesForApp` function (which copies the SEO files to the appropriate `dist` folders based on the build environment).
-   `buildScripts/buildAll.mjs` now calls `buildScripts/copySeoFiles.mjs` via `spawnSync`, passing the `--env` parameter.

**Acceptance Criteria:**

-   `buildScripts/copySeoFiles.mjs` successfully identifies all application directories containing `index.html`.
-   For each identified application, any `robots.txt`, `llm.txt`, or `sitemap.xml` files present in its root are copied to its `dist/development/` and `dist/production/` output folders.
-   The copying occurs reliably at the end of the `buildAll.mjs` execution.
-   The `examples/` folder and its contents should be explicitly excluded from this process, as they are not deployable applications requiring these files.
-   `buildScripts/buildAll.mjs` remains clean and focused on orchestrating the main build steps.

## Timeline

- 2025-11-11T17:47:02Z @tobiu assigned to @tobiu
- 2025-11-11T17:47:03Z @tobiu added the `enhancement` label
- 2025-11-11T17:47:03Z @tobiu added the `ai` label
- 2025-11-11T18:10:47Z @tobiu referenced in commit `fd930e5` - "Integrate SEO File Copying into buildAll.mjs for Application Builds #7747"
- 2025-11-11T18:12:19Z @tobiu closed this issue
- 2025-11-11T18:18:17Z @tobiu added parent issue #7446

