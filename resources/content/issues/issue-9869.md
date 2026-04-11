---
id: 9869
title: 'Unified Data Sync Pipeline (DevIndex, Portal Indexes, and SEO)'
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees: []
createdAt: '2026-04-10T17:32:07Z'
updatedAt: '2026-04-10T17:35:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9869'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-10T17:35:12Z'
---
# Unified Data Sync Pipeline (DevIndex, Portal Indexes, and SEO)

## Overview
The DevIndex automation pipeline originally only scraped opt-in/opt-out statuses and generated the `users.jsonl` output. However, the `neomjs/portal` application relies on an array of generated indices (`tickets.json`, `labels.json`, `releases.json`) and raw Markdown ticket content (`resources/content/issues` and `issue-archive`) to natively render live tracking without needing a full framework version bump. Additionally, SEO files like `sitemap.xml` and `llms.txt` should represent the live state of the site.

## Task
Rename and harden the existing `devindex-pipeline.yml` into a fully unified `data-sync-pipeline.yml`.

### Architecture Additions:
1. **Rebuild Indexes & SEO**: Automatically loop in `buildScripts/docs/index/*.mjs` and `buildScripts/docs/seo/generate.mjs` to keep our knowledge index and LLM map fresh.
2. **Content Synchronization**: Ensure the raw markdown ticket contents (`issues`, `issue-archive`) are correctly copied to the `neomjs/pages` GitHub Pages root so that the Portal Ticket Explorer does not hit a 404 when querying newly created tickets.
3. **Atomicity**: The pipeline will commit all locally generated indexes to the `neo` repo, and propagate them symmetrically to `neomjs/pages` via a single bot push.

## Avoided Pitfalls
Using `cp -r` for `resources/content/*` initially poses a problem since a ticket moving from `issues` to `issue-archive` would not be natively deleted in `temp_pages`. We avoid ghost collisions by running a clean `rm -rf` on the target directories inside the clone, copying fresh, and using `git add -A node_modules/neo.mjs/resources/content/` to let git natively resolve diffs and deletions.

## Timeline

- 2026-04-10T17:32:09Z @tobiu added the `enhancement` label
- 2026-04-10T17:32:09Z @tobiu added the `ai` label
- 2026-04-10T17:32:09Z @tobiu added the `build` label
- 2026-04-10T17:32:25Z @tobiu referenced in commit `07e8572` - "feat: Unified Data Sync Pipeline (#9869)"
- 2026-04-10T17:32:29Z @tobiu cross-referenced by PR #9870
- 2026-04-10T17:35:12Z @tobiu referenced in commit `a7e9b73` - "feat: Unified Data Sync Pipeline (#9869) (#9870)"
- 2026-04-10T17:35:12Z @tobiu closed this issue

