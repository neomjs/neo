---
id: 7446
title: Enhance SEO for Neo.mjs Website
state: OPEN
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T20:06:13Z'
updatedAt: '2025-11-10T20:35:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7446'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 7447
  - 7448
  - 7449
  - 7451
  - 7452
  - 7453
  - 7460
subIssuesCompleted: 1
subIssuesTotal: 7
---
# Enhance SEO for Neo.mjs Website

**Reported by:** @tobiu on 2025-10-10

---

**Sub-Issues:** #7447, #7448, #7449, #7451, #7452, #7453, #7460
**Progress:** 1/7 completed (14%)

---

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

