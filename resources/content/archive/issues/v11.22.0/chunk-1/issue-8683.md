---
id: 8683
title: 'Home Hero Canvas: Visual Polish (Blue Shockwave) & GC Optimization'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T10:56:15Z'
updatedAt: '2026-01-15T11:01:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8683'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T11:01:11Z'
---
# Home Hero Canvas: Visual Polish (Blue Shockwave) & GC Optimization

Refactor `apps/portal/canvas/HomeCanvas.mjs` to adjust visual styles and improve rendering performance.

**Visual Changes:**
- Change the "Red/Crimson" shockwave color to "Light Blue/Cyan" (using the `HIGHLIGHT` constant) to match the Neo.mjs brand and "Neon" theme.

**Performance Improvements:**
- **Eliminate GC Pressure in `drawNetwork`**: The `getPos` helper function currently allocates a new object `{x, y}` for every node and connection check (10k+ allocations per frame). This must be inlined or refactored to use primitive variables.
- **Optimize `drawShockwaves`**: Replace template string RGBA construction (e.g., `` `rgba(..., ${alpha})` ``) with `ctx.globalAlpha` + Constant Hex Colors to reduce string garbage.

**Goal:**
- Achieve stable 60fps with reduced Garbage Collection pauses.


## Timeline

- 2026-01-15T10:56:15Z @tobiu added the `enhancement` label
- 2026-01-15T10:56:16Z @tobiu added the `ai` label
- 2026-01-15T10:56:16Z @tobiu added the `performance` label
- 2026-01-15T10:56:48Z @tobiu changed title from **Home Hero Canvas: Visual Polish (Blue Shockwave) & GC Optimization (#8661)** to **Home Hero Canvas: Visual Polish (Blue Shockwave) & GC Optimization**
- 2026-01-15T10:56:56Z @tobiu added parent issue #8661
- 2026-01-15T11:00:23Z @tobiu referenced in commit `85a3dc5` - "refactor: Optimize HomeCanvas rendering and update shockwave visuals (#8683)"
### @tobiu - 2026-01-15T11:00:49Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the refactoring of `HomeCanvas.mjs`.
> 
> **Changes:**
> 1.  **Visual Update:** Shockwaves now use the `HIGHLIGHT` (Cyan) and `PRIMARY` (Blue) colors instead of Crimson, creating a cleaner "Neon" look consistent with the theme.
> 2.  **GC Optimization (Network):** I inlined the `getPos` helper function within the `drawNetwork` loop. This eliminates the allocation of thousands of temporary `{x, y}` objects per frame during the parallax calculation.
> 3.  **GC Optimization (Shockwaves):** I replaced the template string RGBA construction (e.g., `` `rgba(...)` ``) with `ctx.globalAlpha` combined with constant hex colors. This reduces string garbage collection during shockwave rendering.
> 
> The changes have been pushed to `dev`.
> 

- 2026-01-15T11:00:58Z @tobiu assigned to @tobiu
- 2026-01-15T11:01:12Z @tobiu closed this issue

