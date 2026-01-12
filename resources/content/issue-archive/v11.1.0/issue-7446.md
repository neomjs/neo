---
id: 7446
title: Enhance SEO for Neo.mjs Website
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:06:13Z'
updatedAt: '2025-11-11T18:30:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7446'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 7448 Create DocumentHead Addon with Canonical URL Support'
  - '[x] 7449 Create Sitemap & LLM.txt Generator Script'
  - '[x] 7451 Generate sitemap.xml File via Build Script'
  - '[x] 7452 Generate LLM.txt File via Build Script'
  - '[x] 7453 Update robots.txt for SEO'
  - '[x] 7460 Refactor SEO Generator Script with Correct Data Sources'
  - '[x] 7742 Enhance Sitemap Generation: Add `lastmod` based on Git History'
  - '[x] 7743 Enhance Sitemap Generation: Include Top-Level Application Routes'
  - '[x] 7744 Refactor Release Preparation Script: Rename `injectPackageVersion` to `prepareRelease` and Integrate SEO File Generation'
  - '[x] 7745 Refactor `generate-seo-files.mjs`: Implement CLI Option Parsing with Commander'
  - '[x] 7746 Enhance Release Preparation: Auto-update `datePublished` in `index.html`'
  - '[x] 7747 Integrate SEO File Copying into `buildAll.mjs` for Application Builds'
  - '[x] 7748 Bug: `copySeoFiles.mjs` Fails to Copy SEO Files to Correct `dist` Paths for Applications'
subIssuesCompleted: 13
subIssuesTotal: 13
blockedBy: []
blocking: []
closedAt: '2025-11-11T18:30:24Z'
---
# Enhance SEO for Neo.mjs Website

This epic aims to improve the search engine optimization (SEO) of the Neo.mjs website, specifically focusing on making the blog and learning content discoverable by search engines and Large Language Models (LLMs). The goal is to increase organic traffic and improve the visibility of the Neo.mjs framework.

## Top-Level Items & Implementation Phases

### Phase 1: LLM & Sitemap Integration

- **Goal:** Implement `LLM.txt` and a sitemap to enhance content discoverability for search engines and LLMs.

## Strategic Overview

Our strategy to enhance SEO is a two-pronged approach that addresses both the initial server response and the client-side navigation within our Single-Page Application (SPA), all while working within the constraints of a static hosting environment like GitHub Pages.

### 1. Fixing the Root Domain (`neomjs.com`)

The most critical issue is that our root domain serves a meta-refresh redirect, offering no content to search engines. We will fix this by modifying our deployment process to serve a real, content-rich `index.html` at the root.

-   **The `<base>` Tag Solution:** The deployment script will copy the portal app's `index.html` to the root and inject a `<base href="/dist/production/apps/portal/">` tag into its head. This ensures that crawlers see real content immediately, while all relative asset paths for our live IDE continue to function correctly.

### 2. Managing SPA Routes (Client-Side)

Once the app is loaded, we need to handle client-side route changes to prevent duplicate content issues and provide accurate metadata for each page.

-   **The `HeadManager` Addon:** We will build a new main thread addon responsible for dynamically manipulating the document's `<head>`. Its primary job will be to set the `canonical URL` for each route, which is essential for telling search engines the "true" address of a page and consolidating our SEO authority. It will also manage titles and other meta tags.

### 3. Automating Content Discovery

To ensure search engines have an up-to-date map of our site, we will automate the generation of discovery files.

-   **Generator Script:** A new build script will parse our content manifests (like `learn/tree.json`) to automatically generate a complete `sitemap.xml` and `llm.txt`. This ensures these files are never out of date and requires zero manual maintenance.

This combination of a server-side deployment fix and a client-side management addon, supported by automated file generation, provides a robust and sustainable solution to dramatically improve the project's visibility.

## Timeline

- 2025-10-10T20:06:13Z @tobiu assigned to @tobiu
- 2025-10-10T20:06:14Z @tobiu added the `epic` label
- 2025-10-10T20:06:14Z @tobiu added the `ai` label
- 2025-10-10T20:08:09Z @tobiu added sub-issue #7447
- 2025-10-10T20:09:37Z @tobiu added sub-issue #7448
- 2025-10-10T20:10:53Z @tobiu added sub-issue #7449
- 2025-10-10T20:14:07Z @tobiu added sub-issue #7451
- 2025-10-10T20:16:52Z @tobiu added sub-issue #7452
- 2025-10-10T20:20:29Z @tobiu added sub-issue #7453
- 2025-10-10T20:23:25Z @tobiu referenced in commit `3e7b454` - "#7446 tickets as md files"
- 2025-10-11T09:36:01Z @tobiu added sub-issue #7460
- 2025-11-10T21:05:35Z @tobiu referenced in commit `ab89104` - "#7446 early stage draft versions of the generated files"
- 2025-11-11T11:09:30Z @tobiu referenced in commit `5e018bf` - "#7446 buildScripts/generate-seo-files.mjs => #-based routes"
- 2025-11-11T11:18:35Z @tobiu referenced in commit `f64d61c` - "#7446 updated llm.txt"
- 2025-11-11T11:38:31Z @tobiu added sub-issue #7742
- 2025-11-11T11:59:24Z @tobiu added sub-issue #7743
- 2025-11-11T12:06:08Z @tobiu added sub-issue #7744
- 2025-11-11T12:33:49Z @tobiu added sub-issue #7745
- 2025-11-11T13:08:21Z @tobiu referenced in commit `502790a` - "#7446 generate-seo-files.mjs: switched sitemap url to https"
- 2025-11-11T17:29:29Z @tobiu added sub-issue #7746
- 2025-11-11T18:18:17Z @tobiu added sub-issue #7747
- 2025-11-11T18:27:28Z @tobiu added sub-issue #7748
- 2025-11-11T18:30:13Z @tobiu removed sub-issue #7447
- 2025-11-11T18:30:24Z @tobiu closed this issue

