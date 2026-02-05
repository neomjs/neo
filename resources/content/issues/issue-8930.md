---
id: 8930
title: 'Epic: DevRank - The GitHub Meritocracy Index'
state: OPEN
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-02-01T15:19:40Z'
updatedAt: '2026-02-02T23:03:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8930'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8931 Feat: DevRank Scaffolding & Data PoC'
  - '[x] 8932 Feat: DevRank UI - Grid & Controls Implementation'
  - '[x] 8933 Feat: Discovery Engine Data Enrichment'
  - '[x] 8934 Feat: DevRank Grid Expansion'
  - '[x] 8935 Feat: Yearly Breakdown Columns & Heatmap'
  - '[x] 8936 Fix: RecordFactory mapping logic not triggering for missing source keys'
  - '[ ] 8937 Feat: Discovery Engine - The Spider'
  - '[ ] 8938 Feat: UI Filtering Logic'
  - '[x] 8939 Feat: Country Flag Column'
  - '[x] 8940 Feat: Activity Sparkline Column'
  - '[ ] 8941 Feat: Implement Neo.form.field.CountryFlagPicker'
  - '[x] 8942 Refactor: DevRank Grid Location Column (VDOM + SCSS)'
  - '[x] 8943 Feat: Interactive Living Sparklines'
  - '[x] 8944 Feat: Sparkline Pulse Animation'
  - '[x] 8945 Feat: Sparkline `usePulse` Config'
  - '[x] 8946 Feat: Sparkline Physics & Visuals'
  - '[x] 8947 Docs: Sparkline Knowledge Base Enhancement'
  - '[x] 8957 Fix: Sparkline Pulse Artifact Persistence'
  - '[x] 8958 Enhancement: Sparkline Scanner Text Positioning'
  - '[x] 8959 Feat: Implement hideMode for Grid Columns to support OffscreenCanvas buffering'
  - '[x] 8960 Fix: Vertical scrolling causes OffscreenCanvas loss in Grid cells'
  - '[x] 8961 Fix: Memory Leak in Neo.component.Canvas due to missing destroy()'
  - '[x] 8962 Perf: Apply CSS containment to Grid Rows'
  - '[x] 8963 Feat: Smooth Data Transitions for Sparklines'
  - '[x] 8997 Feat: DevRank Selection Model Tab'
  - '[ ] 9005 Feat: Refactor Portal Header to Framework (using Dynamic Worker Arch)'
  - '[x] 9006 Refactor DevRank Controls Button to Header Toolbar'
subIssuesCompleted: 23
subIssuesTotal: 27
blockedBy: []
blocking: []
---
# Epic: DevRank - The GitHub Meritocracy Index

This epic tracks the development of "DevRank", a Neo.mjs application designed to index and rank GitHub contributors based on their all-time total contributions, irrespective of repository popularity or follower count.

The goal is to create a meritocratic index of the open-source ecosystem, powered by a sophisticated discovery engine ("The Spider") and a high-performance Neo.mjs frontend.

### Core Components
1.  **Data Pipeline:** A Node.js-based discovery engine to fetch, validate, and aggregate user contribution data from the GitHub GraphQL API.
2.  **The Index:** A local JSON database of contributors, initially populated via "Impact" (Top Repos) and "Network" (Spider) vectors.
3.  **The UI:** A Neo.mjs application to visualize the index with advanced filtering, sorting, and performance metrics.

### Roadmap
- [ ] **Scaffolding & PoC:** Initialize the App structure and implement the "Deep Scan" data fetching proof-of-concept.
- [ ] **Discovery Engine:** Implement the "Spider" algorithm to expand the contributor graph.
- [ ] **UI Implementation:** Build the Grid and Analytics view.
- [ ] **Optimization:** Refine data storage and API usage.


## Timeline

- 2026-02-01T15:19:41Z @tobiu added the `epic` label
- 2026-02-01T15:19:41Z @tobiu added the `ai` label
- 2026-02-01T15:20:36Z @tobiu added sub-issue #8931
- 2026-02-01T15:26:53Z @tobiu added sub-issue #8932
- 2026-02-01T15:38:42Z @tobiu added sub-issue #8933
- 2026-02-01T15:38:58Z @tobiu added sub-issue #8934
- 2026-02-01T15:59:36Z @tobiu added sub-issue #8935
- 2026-02-01T16:25:59Z @tobiu added sub-issue #8936
- 2026-02-01T16:43:26Z @tobiu added sub-issue #8937
- 2026-02-01T16:43:54Z @tobiu added sub-issue #8938
- 2026-02-01T16:44:12Z @tobiu added sub-issue #8939
- 2026-02-01T16:44:35Z @tobiu added sub-issue #8940
- 2026-02-01T17:31:28Z @tobiu added sub-issue #8941
- 2026-02-01T17:59:01Z @tobiu added sub-issue #8942
- 2026-02-02T00:26:10Z @tobiu added sub-issue #8943
- 2026-02-02T00:26:31Z @tobiu assigned to @tobiu
- 2026-02-02T12:57:40Z @tobiu added sub-issue #8944
- 2026-02-02T13:04:24Z @tobiu added sub-issue #8945
- 2026-02-02T13:12:19Z @tobiu added sub-issue #8946
- 2026-02-02T13:23:35Z @tobiu added sub-issue #8947
### @tobiu - 2026-02-02T23:03:32Z

**Input from Gemini 3 Pro:**

> ✦ ### Architectural Update: Generic Sparkline Components
> 
> The "Living Sparklines" feature (Issue #8943) triggered a significant architectural improvement that extended beyond the scope of this DevRank application.
> 
> We recognized that the "Auto-Initializing Worker" pattern developed for the sparklines was highly reusable. Consequently, we spun off Epic #8948 (Dynamic Worker Architecture) to refactor this logic into the core framework.
> 
> **Impact on DevRank:**
> -   **Obsolete Code:** `apps/devrank/view/SparklineComponent.mjs` has been deleted.
> -   **Obsolete Code:** `apps/devrank/canvas/Sparkline.mjs` has been moved to `src/canvas/Sparkline.mjs`.
> -   **Refactoring:** `DevRank.view.GridContainer` now uses the generic `Neo.grid.column.Sparkline` with `type: 'sparkline'`.
> 
> This refactoring means DevRank is now "consuming" the standard framework capability it helped pioneer, rather than maintaining a custom implementation. The original tickets (#8940, #8943) remain valid as the origin story, but the code has moved.

- 2026-02-03T10:24:39Z @tobiu added sub-issue #8957
- 2026-02-03T10:39:03Z @tobiu added sub-issue #8958
- 2026-02-03T12:32:20Z @tobiu added sub-issue #8959
- 2026-02-03T12:43:12Z @tobiu added sub-issue #8960
- 2026-02-03T13:01:53Z @tobiu added sub-issue #8961
- 2026-02-03T13:01:55Z @tobiu added sub-issue #8962
- 2026-02-03T13:01:57Z @tobiu added sub-issue #8963
- 2026-02-04T17:21:26Z @tobiu referenced in commit `abe67c3` - "#8930 "neo-theme-neo-dark", "neo-theme-neo-light""
- 2026-02-05T09:31:30Z @tobiu added sub-issue #8997
- 2026-02-05T14:51:36Z @tobiu added sub-issue #9005
- 2026-02-05T17:44:24Z @tobiu added sub-issue #9006

