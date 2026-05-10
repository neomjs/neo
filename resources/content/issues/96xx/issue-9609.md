---
id: 9609
title: 'Epic: Grid Multi-Body Architecture for Zero-Jitter Locked Columns (reopened from #9486)'
state: CLOSED
labels:
  - epic
  - ai
  - grid
assignees: []
createdAt: '2026-03-31T12:12:49Z'
updatedAt: '2026-03-31T12:13:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9609'
author: github-actions
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T12:13:42Z'
---
# Epic: Grid Multi-Body Architecture for Zero-Jitter Locked Columns (reopened from #9486)

Originally: #9486

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

- 2026-03-31T12:12:51Z @github-actions added the `epic` label
- 2026-03-31T12:12:51Z @github-actions added the `ai` label
- 2026-03-31T12:12:51Z @github-actions added the `grid` label
- 2026-03-31T12:12:51Z @github-actions cross-referenced by #9486
### @tobiu - 2026-03-31T12:13:41Z

Closing automatically created mistakenly duplicated Epic.

- 2026-03-31T12:13:42Z @tobiu closed this issue

