---
id: 9486
title: 'Epic: Grid Multi-Body Architecture for Zero-Jitter Locked Columns'
state: OPEN
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T17:41:38Z'
updatedAt: '2026-06-11T01:21:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9486'
author: tobiu
commentsCount: 6
parentIssue: null
subIssues:
  - '[x] 9487 Grid Multi-Body: Refactor Layout Engine & SubGrid Partitioning'
  - '[x] 9488 Grid Multi-Body: SubGrid Row Pooling & Vertical Sync Refactoring'
  - '[x] 9489 Grid Multi-Body: Decoupled Horizontal Scroller & Main Thread Sync'
  - '[x] 9490 Grid Multi-Body: Remove Obsolete GridColumnScrollPinning Addon & CSS Vars'
  - '[x] 9491 Grid Multi-Body: Overhaul Column Drag & Drop (SortZone) across Split Headers'
  - '[ ] 9492 Grid Multi-Body: Adapt Selection Models for Split Rows'
  - '[ ] 9493 Grid Multi-Body: Enable Cross-Window SubGrid Detachment (Pop-out)'
  - '[ ] 9494 Grid Multi-Body: Implement Direct Main-Thread Scroll Sync via MessageChannel'
  - '[ ] 9495 Grid Multi-Body: Implement Data-Driven Variable Row Height Architecture'
  - '[ ] 9496 Grid Multi-Body: Adapt Keyboard Navigation for Split Bodies'
  - '[x] 9497 Grid Multi-Body: Split Column Collections and Orchestration'
  - '[x] 9498 Grid Multi-Body: Infinite Canvas Cross-Window Column Drag & Drop'
  - '[x] 9499 Grid Multi-Body: Test Suite Refactoring & Expansion'
  - '[x] 9611 Grid Multi-Body: Native Vertical Scrollbar & Alignment Spacer'
  - '[x] 9612 Grid Multi-Body: Scrollbar Refactoring and Vertical Restoration'
  - '[x] 9613 Grid Multi-Body: Fix horizontal DragScroll and Mousewheel translation'
  - '[x] 9608 Fix Event Resolution and Parent Hierarchy Regressions in Nested Sub-Grids'
  - '[x] 9607 GridContainer: `this.items is not iterable` crash on initialization'
  - '[x] 9615 Sub-Epic: Grid Multi-Body Stabilization (Header Sync & Pinning)'
  - '[x] 9616 Grid Multi-Body: Implement Two-Tier Horizontal Cell Pooling and Scroll Sync'
  - '[x] 9617 Grid Multi-Body: Fix Row Scroll Pinning for Thumb Dragging'
  - '[x] 9618 DevIndex High-Velocity Grid Thumb Drag Scroll Jitter'
  - '[x] 9619 Grid Multi-Body: Implement and Test Locked Columns in DevIndex'
  - '[x] 9620 Grid Multi-Body: Fix Null Data Store and Consolidate Loading Mask'
  - '[x] 9622 Grid Multi-Body: Resolve duplicate cell rendering and phantom nodes'
  - '[x] 9623 Grid Multi-Body: Fix .neo-last-column border styling logic across multiple bodies'
  - '[x] 9624 [Multi-Body Grid] Resolve Border Overlap, Header Sync, and Scroll Propagation'
  - '[x] 9625 Multi-Body Grid: Visually delegate native vertical scrollbar UX with CSS'
  - '[x] 9614 Grid Multi-Body: Fix Horizontal Row Clipping & Scrollbar SCSS'
  - '[x] 9626 Epic: Grid Unified Scrolling & VDOM Orchestration'
  - '[x] 9635 Grid Multi-Body: Restoring Vertical Scrollbar for Dual-Pipeline GPU Thumb Pinning'
  - '[x] 9636 Grid Multi-Body: Simplify GridDragScroll Scrollbar Hit Detection'
  - '[ ] 9637 Grid Multi-Body: E2E Telemetry Adjustments for Dual-Pipeline Scrolling'
  - '[x] 9868 R&D: Grid Multi-Body Selection Architecture Redesign'
  - '[ ] 9872 Grid Multi-Body: 3-Tier Component Orchestration and Architecture Refactoring'
  - '[x] 12878 Column-header DnD resort misbehaves in locked multi-region grids'
  - '[x] 12883 Column drag to the locked-end region fails to re-home (silent)'
subIssuesCompleted: 30
subIssuesTotal: 37
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Epic: Grid Multi-Body Architecture for Zero-Jitter Locked Columns

The initial approach to locked columns (`locked: 'start' | 'end'`) relied on a single `overflow-x: auto` scrolling container and synchronously injecting CSS variables (`--grid-locked-start-offset`) via a Main Thread addon to counteract the native scroll translation with `transform: translateX()`.

While theoretically sound, testing revealed an insurmountable limitation in browser architecture: **Main Thread vs. Compositor Thread synchronization**.

When a user scrolls horizontally, the browser's GPU compositor instantly shifts the entire scrolling container and paints the frame. The Main Thread `scroll` event fires *after* this native paint. Therefore, our JavaScript-driven CSS variable correction always arrives one frame late, causing an inescapable "elastic lag" or jitter during fast scrolling. 

Attempts to bypass the compositor using `position: sticky` fail because `sticky` breaks the `position: absolute` mathematical layout engine required for cell pooling and virtualization.

To achieve truly zero-jitter locked columns, we must adopt a **Multi-Body Architecture**.

**The V2 Architecture:**
To prioritize vertical scroll performance (where massive data virtualization happens), we will decouple horizontal and vertical scrolling physics.

1. **The Unified Vertical Wrapper:** A single, outer container (`overflow-y: auto`) will handle vertical scrolling for all bodies natively. This guarantees zero vertical jitter, as the browser compositor moves all bodies up/down as a single unit.
2. **The Split SubGrids:** Inside the vertical wrapper, the Grid is structurally split into up to three physical grid bodies sitting side-by-side:
   - **Left Body:** `overflow-x: hidden`. Contains only `locked: 'start'` columns.
   - **Center Body:** `overflow-x: hidden`. Contains standard unlocked columns.
   - **Right Body:** `overflow-x: hidden`. Contains only `locked: 'end'` columns.
3. **The Decoupled Horizontal Scroller:** Because the Center Body sits inside the tall virtualized vertical wrapper, its native horizontal scrollbar would be pushed to the bottom of the virtual data (e.g., 500,000px down). We must build a decoupled, "fake" horizontal scrollbar locked to the bottom of the grid viewport.
4. **Synchronous Horizontal JS Sync:** A Main Thread Addon will capture the scroll event from the decoupled horizontal scroller and synchronously update the `scrollLeft` of the Center Body and Header. 

**Distributed Grid Architecture (The Killer Demo):**
The multi-body architecture naturally enables cross-window capabilities. Because Neo.mjs manages the DOM virtually from the App Worker, SubGrids can be detached from the main window and rendered in entirely separate browser windows (multi-monitor setups).
- To achieve low-latency scroll synchronization across windows, Main Thread Addons will establish direct `MessageChannel` communication, passing ports through the App Worker.
- Visual selection states (Row Hover, Keyboard Nav) will span across windows seamlessly, driven by the App Worker's single source of truth, without requiring OS-level window focus changes.

**Future-Proofing for Variable Row Heights:**
A known risk of split SubGrids is maintaining visual row alignment if variable row heights are introduced in the future. Because Neo.mjs manages the VDOM entirely within the App Worker, we have a strategic advantage over other frameworks that suffer from layout thrashing in this scenario. Instead of relying on expensive Main Thread DOM measurement loops to sync heights across bodies, the App Worker will act as the single source of truth for row heights, injecting identical height configurations across all active SubGrids simultaneously.

**The Rewrite Scope:**
This architecture changes the core assumption that "one record = one DOM node in one container". It requires a comprehensive rewrite of interacting systems, including cross-container Drag & Drop (`SortZone`), Selection Models (`RowModel`, `CellModel`), and Keyboard Navigation.

## Timeline

- 2026-03-16T17:41:40Z @tobiu added the `epic` label
- 2026-03-16T17:41:40Z @tobiu added the `ai` label
- 2026-03-16T17:41:40Z @tobiu added the `grid` label
- 2026-03-16T17:43:12Z @tobiu assigned to @tobiu
- 2026-03-16T18:15:12Z @tobiu cross-referenced by #9487
- 2026-03-16T18:15:26Z @tobiu added sub-issue #9487
- 2026-03-16T18:15:39Z @tobiu cross-referenced by #9488
- 2026-03-16T18:15:58Z @tobiu added sub-issue #9488
- 2026-03-16T18:16:29Z @tobiu cross-referenced by #9489
- 2026-03-16T18:16:41Z @tobiu added sub-issue #9489
- 2026-03-16T18:18:09Z @tobiu cross-referenced by #9490
- 2026-03-16T18:18:42Z @tobiu added sub-issue #9490
- 2026-03-16T18:21:29Z @tobiu cross-referenced by #9491
- 2026-03-16T18:21:43Z @tobiu added sub-issue #9491
- 2026-03-16T18:21:55Z @tobiu cross-referenced by #9492
- 2026-03-16T18:22:10Z @tobiu added sub-issue #9492
### @tobiu - 2026-03-16T21:41:22Z

**Input from Gemini 3.1 Pro:**

> ✦ I have expanded the scope of this Epic to include the "Distributed Grid Architecture" vision. 
> 
> The multi-body split enables the "Killer Demo" scenario of detaching a locked column SubGrid into a separate physical browser window while maintaining state and sync.
> 
> New sub-issues added:
> *   #9493 Grid Multi-Body: Enable Cross-Window SubGrid Detachment (Pop-out)
> *   #9494 Grid Multi-Body: Implement Direct Main-Thread Scroll Sync via MessageChannel
> *   #9495 Grid Multi-Body: Implement Data-Driven Variable Row Height Architecture

- 2026-03-16T21:41:26Z @tobiu added sub-issue #9493
- 2026-03-16T21:41:29Z @tobiu added sub-issue #9494
- 2026-03-16T21:41:30Z @tobiu added sub-issue #9495
- 2026-03-16T21:51:31Z @tobiu cross-referenced by #9496
- 2026-03-16T21:51:56Z @tobiu added sub-issue #9496
- 2026-03-16T22:13:45Z @tobiu cross-referenced by #9497
- 2026-03-16T22:13:58Z @tobiu added sub-issue #9497
- 2026-03-16T22:23:09Z @tobiu cross-referenced by #9498
- 2026-03-16T22:23:19Z @tobiu added sub-issue #9498
- 2026-03-16T22:29:03Z @tobiu cross-referenced by #9499
- 2026-03-16T22:29:29Z @tobiu added sub-issue #9499
### @tobiu - 2026-03-17T19:00:57Z

quick info: this epic is currently planned **after** the release of neo v12.1, since the scope is massive.

- 2026-03-27T11:25:25Z @tobiu cross-referenced by #9577
### @tobiu - 2026-03-31T10:02:55Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ ### Architectural Refinement (Pre-Flight Plan)
> 
> Following initial analysis of the multi-body architecture, we have codified two major structural refinements:
> 
> 1. **Symmetric Wrapper Architecture (~#9487)**
>    To eliminate all `transform` math hacks, the split must apply perfectly to both the Body and the Header Toolbar. 
>    *   `bodyWrapper_`: A protected `hbox` container with `overflow-y: auto`, holding up to 3 `grid.Body` instances (`bodyStart`, `bodyCenter`, `bodyEnd`).
>    *   `headerWrapper_`: A protected `hbox` container holding up to 3 localized `header.Toolbar` instances.
>    The `center` pairs cleanly sync their horizontal scroll together via the decoupled scroller, while `start` and `end` pairs remain static. The `GridContainer` remains backward compatible by accepting a single `columns` array, internally partitioning it, and instantiating only the necessary 1-3 pairs.
> 
> 2. **Row Height Synchronization Strategy (~#9495)**
>    *   **Version 1 (Static):** All instantiated sub-grids will rigorously enforce the unified, fixed `rowHeight` configured on the parent `GridContainer`.
>    *   **Version 2 (Future Variable Heights):** Because the split bodies share the exact same `startIndex` and `endIndex` pooling calculation, the physical arrays map 1:1. The App Worker will calculate the `Math.max()` height for a specific row index and inject an identical explicit `style.height` directly into the VDOM of all sibling body rows simultaneously. This guarantees perfect cross-body alignment without layout thrashing.
> 
> We are now commencing Phase 1 (#9497: Split Column Collections and Orchestration) implementation based on this refined blueprint.

- 2026-03-31T12:09:34Z @tobiu referenced in commit `098490d` - "fix: Grid Multi-Body Architecture Type Desynchronization (#9486)"
### @tobiu - 2026-03-31T12:10:42Z

Resolved: Stabilized Grid Multi-Body Architecture by decoupling column instantiation from toolbar items creation. Passed tests.

- 2026-03-31T12:10:43Z @tobiu closed this issue
- 2026-03-31T12:12:40Z @tobiu reopened this issue
- 2026-03-31T12:12:48Z @github-actions closed this issue
### @github-actions - 2026-03-31T12:12:50Z

❌ Tickets cannot be reopened. Created new ticket: #9609

- 2026-03-31T12:12:50Z @github-actions cross-referenced by #9609
- 2026-03-31T12:14:10Z @tobiu reopened this issue
- 2026-03-31T14:07:03Z @tobiu added sub-issue #9611
- 2026-03-31T14:25:27Z @tobiu cross-referenced by #9612
- 2026-03-31T15:14:03Z @tobiu added sub-issue #9612
- 2026-03-31T15:14:16Z @tobiu added sub-issue #9613
- 2026-03-31T15:14:35Z @tobiu added sub-issue #9608
- 2026-03-31T15:14:49Z @tobiu added sub-issue #9607
- 2026-03-31T20:21:54Z @tobiu added sub-issue #9615
- 2026-03-31T20:22:29Z @tobiu cross-referenced by #9616
- 2026-03-31T20:22:36Z @tobiu added sub-issue #9616
- 2026-03-31T20:45:04Z @tobiu cross-referenced by #9617
- 2026-03-31T20:45:12Z @tobiu added sub-issue #9617
- 2026-04-01T10:22:33Z @tobiu added sub-issue #9618
- 2026-04-01T17:27:58Z @tobiu added sub-issue #9619
- 2026-04-01T17:36:58Z @tobiu added sub-issue #9620
- 2026-04-01T19:56:36Z @tobiu added sub-issue #9622
- 2026-04-01T20:03:31Z @tobiu added sub-issue #9623
- 2026-04-01T20:25:38Z @tobiu added sub-issue #9624
- 2026-04-01T21:01:59Z @tobiu added sub-issue #9625
- 2026-04-01T21:42:18Z @tobiu added sub-issue #9614
- 2026-04-02T08:17:16Z @tobiu added sub-issue #9626
- 2026-04-02T22:54:09Z @tobiu added sub-issue #9635
- 2026-04-02T23:02:31Z @tobiu added sub-issue #9636
- 2026-04-02T23:02:43Z @tobiu added sub-issue #9637
- 2026-04-09T21:18:42Z @tobiu cross-referenced by #9839
- 2026-04-10T16:35:19Z @tobiu added sub-issue #9868
- 2026-04-10T18:19:43Z @tobiu added sub-issue #9872
- 2026-04-19T11:34:22Z @tobiu referenced in commit `a32c0af` - "fix(github-workflow): paginate timelineItems to prevent silent content drop (#10090)

The IssueSyncer rendered comment bodies through the unified timelineItems
GraphQL channel, which was page-capped at maxTimelineItemsPerIssue (50) with
no continuation logic. Once an issue's timeline grew past the cap, tail
events including newly-authored comments were silently dropped from the
local markdown while scalar frontmatter metadata (commentsCount, updatedAt)
stayed correct — a divergence between metadata tracking and content
rendering that gave a false appearance of successful sync.

Changes:
- issueQueries: add pageInfo on timelineItems in both FETCH queries and
  introduce FETCH_ISSUE_TIMELINE_PAGE for continuation fetches.
- IssueSyncer: add #exhaustTimelineItems pagination primitive with a warn
  log on continuation; extract the related-issues force-update loop into
  a reusable refetchIssuesByNumber(numbers, metadata) method that both
  pullFromGitHub and external tooling share.
- SyncService: expose refetchIssuesByNumber({numbers}) as the SDK entry
  for surgical recovery bypassing delta-sync updatedAt gating.
- ai/scripts/detectTruncatedTimelines.mjs: diagnostic that flags files
  whose rendered comment blocks fall short of frontmatter commentsCount
  or whose timeline sits exactly at the cap.
- ai/scripts/refetchTruncatedIssues.mjs: thin recovery wrapper that
  consumes the detector output (list or --stdin JSON) and delegates to
  the SyncService endpoint.
- IssueSyncer.spec: Playwright regression covering a 75-event mocked
  issue that forces one continuation page and asserts every comment and
  structural event lands in the rendered markdown.

Recovery artifacts in this commit: issues #10030, #9486, #9999, #9535 —
the four issues flagged as drifted by the detector baseline run — were
healed via the new refetch endpoint and now reflect live GitHub state."
- 2026-04-19T11:35:15Z @tobiu cross-referenced by PR #10091
- 2026-04-19T11:41:29Z @tobiu referenced in commit `3ec8167` - "fix(github-workflow): paginate timelineItems to prevent silent content drop (#10090) (#10091)

The IssueSyncer rendered comment bodies through the unified timelineItems
GraphQL channel, which was page-capped at maxTimelineItemsPerIssue (50) with
no continuation logic. Once an issue's timeline grew past the cap, tail
events including newly-authored comments were silently dropped from the
local markdown while scalar frontmatter metadata (commentsCount, updatedAt)
stayed correct — a divergence between metadata tracking and content
rendering that gave a false appearance of successful sync.

Changes:
- issueQueries: add pageInfo on timelineItems in both FETCH queries and
  introduce FETCH_ISSUE_TIMELINE_PAGE for continuation fetches.
- IssueSyncer: add #exhaustTimelineItems pagination primitive with a warn
  log on continuation; extract the related-issues force-update loop into
  a reusable refetchIssuesByNumber(numbers, metadata) method that both
  pullFromGitHub and external tooling share.
- SyncService: expose refetchIssuesByNumber({numbers}) as the SDK entry
  for surgical recovery bypassing delta-sync updatedAt gating.
- ai/scripts/detectTruncatedTimelines.mjs: diagnostic that flags files
  whose rendered comment blocks fall short of frontmatter commentsCount
  or whose timeline sits exactly at the cap.
- ai/scripts/refetchTruncatedIssues.mjs: thin recovery wrapper that
  consumes the detector output (list or --stdin JSON) and delegates to
  the SyncService endpoint.
- IssueSyncer.spec: Playwright regression covering a 75-event mocked
  issue that forces one continuation page and asserts every comment and
  structural event lands in the rendered markdown.

Recovery artifacts in this commit: issues #10030, #9486, #9999, #9535 —
the four issues flagged as drifted by the detector baseline run — were
healed via the new refetch endpoint and now reflect live GitHub state."
- 2026-04-20T11:19:03Z @tobiu cross-referenced by PR #10122
- 2026-06-07T21:33:35Z @neo-opus-ada cross-referenced by PR #12701
- 2026-06-07T21:42:16Z @neo-gpt cross-referenced by PR #12697
- 2026-06-07T21:42:18Z @neo-gpt cross-referenced by #12696
- 2026-06-07T23:55:00Z @neo-opus-ada cross-referenced by #12707
- 2026-06-07T23:56:40Z @neo-opus-ada cross-referenced by PR #12708
- 2026-06-08T03:58:31Z @neo-opus-grace cross-referenced by PR #12722
- 2026-06-08T10:14:56Z @neo-opus-grace cross-referenced by PR #12754
- 2026-06-08T11:05:28Z @neo-opus-grace cross-referenced by #12757
- 2026-06-08T11:05:42Z @neo-opus-grace cross-referenced by #12758
- 2026-06-08T21:45:37Z @neo-opus-ada cross-referenced by PR #12784
- 2026-06-09T00:11:22Z @neo-opus-grace cross-referenced by #12800
- 2026-06-09T00:14:03Z @neo-opus-grace cross-referenced by PR #12801
- 2026-06-10T23:25:54Z @neo-fable cross-referenced by #12878
- 2026-06-10T23:26:09Z @neo-fable added sub-issue #12878
- 2026-06-10T23:30:11Z @neo-fable cross-referenced by #12807
- 2026-06-11T00:17:03Z @neo-fable cross-referenced by #12880
- 2026-06-11T00:19:03Z @neo-fable cross-referenced by PR #12881
### @neo-fable - 2026-06-11T01:21:09Z

**Input from Claude Fable 5 (Claude Code):**

> ❋ ## Open-sub staleness triage needed (27/36 done — the remaining 9 are part-gap, part-ghost)
> 
> Operator context (2026-06-11 nightshift): this epic's open tail "might explain gaps in the new grid — however, there will be stale items." The architecture moved UNDER several of these subs during the v13 window; each open sub needs a per-item verdict — **live-gap / stale-supersede / reshape** — before anyone burns a session implementing a superseded design.
> 
> **Known supersession anchors for the pass (V-B-A'd tonight or operator-named):**
> 
> 1. **Per-body peer SelectionModels are SUPERSEDED** by the `grid.View`-owned single SelectionModel (SSOT): #12758 (CLOSED, shipped via PR `#12784`) + the #9492 design-lock comment (https://github.com/neomjs/neo/issues/9492#issuecomment-4644149298). Any open sub assuming peer-SM-per-body construction (selection-sync subs especially — e.g. #9830's premise predates the SSOT) is in the stale-or-reshape class. The release note's grid cut-line already records the supersession publicly.
> 2. **Cross-toolbar column DnD shipped**: #9491 CLOSED via PR #12792; the locked-region corruption layer fixed tonight via PR #12881 (#12878); the landing-index residual is #12880 (@neo-gpt, active). Open subs overlapping that surface should reference, not re-plan it.
> 3. **`grid.View` owns body-scroll orchestration** (PR #12754) and `header.Wrapper` is extracted (#12800) — subs written against the pre-Wrapper topology need their Architectural Reality sections re-grounded.
> 
> **Suggested verdict vocabulary** (mirrors tonight's board + assignment triage): `live-keep` (real gap, premise holds) / `retire-supersede` (close citing the anchor) / `reshape` (gap real, prescription stale — comment the delta, don't silently rewrite another author's body).
> 
> @neo-opus-ada surfaced the 27/36 state during her assignment-triage pass — natural pickup if she wants it (hot context), but self-select per flat-peer. The pass output belongs here as a per-sub matrix comment, epic-resolution style.

- 2026-06-11T01:37:24Z @neo-fable cross-referenced by PR #12882
- 2026-06-11T01:46:25Z @neo-fable cross-referenced by #12883
- 2026-06-11T01:47:03Z @neo-fable added sub-issue #12883
- 2026-06-11T08:54:14Z @neo-gpt cross-referenced by PR #12892
- 2026-06-11T09:35:58Z @neo-gpt cross-referenced by PR #12893
- 2026-06-12T01:40:22Z @neo-fable cross-referenced by #12941

