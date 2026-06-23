---
id: 8163
title: Cross-Window Drag & Drop Refinement & Topology
state: OPEN
labels:
  - epic
  - no auto close
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-27T21:26:45Z'
updatedAt: '2026-06-23T03:56:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8163'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 8160 Decouple and Configure Window Detachment Thresholds in SortZone'
  - '[x] 8161 Refine Cross-Window Drag Intersection to Target SortZone Rect'
  - '[x] 8162 Fix Layout Corruption in Target Dashboard on Remote Drag Exit'
  - '[x] 8164 Enhance Neo.manager.Window to Track Full Window Geometry'
  - '[ ] 8165 Implement Configurable Theme Inheritance for Dragged Items'
  - '[ ] 8166 Implement Cross-Window Drop Validation and Topology Rules'
  - '[x] 8167 Harden Return Trip Logic for Detached Items'
subIssuesCompleted: 5
subIssuesTotal: 7
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Cross-Window Drag & Drop Refinement & Topology

This epic tracks the advanced refinement and functional expansion of the Cross-Window Drag & Drop system ("Infinite Canvas").

**Scope:**
1.  **Theming Strategy:**
    *   Implement configurable behavior for dragged items: `themeMode: 'adapt' | 'retain'`.
    *   Ensure items dropped into a different app/window correctly adopt (or resist) the target's theme.

2.  **Topology & Validation (Sender/Receiver Rules):**
    *   Enhance `SortZone` validation to support asymmetric flows (e.g., Inner Dashboard -> Main Dashboard allowed, but Main -> Inner blocked).
    *   Implement `allowDrop(draggedItem, sourceZone)` hooks.

3.  **"Return Trip" Robustness (A -> B -> A):**
    *   Verify and harden the logic for dragging an item out of Window A, hovering Window B, and returning to Window A.
    *   Ensure state tracking (`detachedItems`) remains consistent and the original dashboard correctly reclaims its item without duplication or state loss.

4.  **Architecture & Documentation:**
    *   Review `DragCoordinator` responsibility (is it doing too much visual calculation?).
    *   Comprehensive JSDoc cleanup across `SortZone`, `DashboardSortZone`, and `DragCoordinator`.

## Timeline

- 2025-12-27T21:26:46Z @tobiu added the `epic` label
- 2025-12-27T21:26:46Z @tobiu added the `ai` label
- 2025-12-27T21:26:46Z @tobiu added the `architecture` label
- 2025-12-27T21:33:39Z @tobiu added sub-issue #8160
- 2025-12-27T21:33:42Z @tobiu added sub-issue #8161
- 2025-12-27T21:33:44Z @tobiu added sub-issue #8162
- 2025-12-27T21:33:46Z @tobiu added sub-issue #8164
- 2025-12-27T21:33:48Z @tobiu added sub-issue #8165
- 2025-12-27T21:33:50Z @tobiu added sub-issue #8166
- 2025-12-27T21:33:52Z @tobiu added sub-issue #8167
- 2025-12-27T22:48:29Z @tobiu assigned to @tobiu
### @github-actions - 2026-03-28T03:54:38Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-28T03:54:38Z @github-actions added the `stale` label
- 2026-03-28T05:56:53Z @tobiu removed the `stale` label
- 2026-03-28T05:56:53Z @tobiu added the `no auto close` label
- 2026-06-23T03:46:30Z @neo-gpt cross-referenced by #8166
- 2026-06-23T03:53:56Z @neo-gpt cross-referenced by #8165
### @neo-gpt - 2026-06-23T03:56:37Z

[EPIC_STATUS] Current child-state ledger from the 2026-06-23 maintenance sweep.

This epic should stay open, but it is not currently a direct implementation lane. The child state is split:

- #8164 geometry tracking: closed. `Neo.manager.Window` / `DragCoordinator` already carry the full-window geometry substrate (`outerRect`, `innerRect`, chrome decomposition), and later infinite-canvas work builds on it.
- #8167 return-trip hardening: closed.
- #8165 theme inheritance: open, now `not-code-ready` + `needs-design` + `needs-re-triage`. The missing piece is not just a config flag; the contract has to define proxy-only vs permanent live-widget transfer, `adapt`/`retain` semantics, `insertThemeFiles()` behavior, and fallback when source/target theme maps diverge.
- #8166 topology / `allowDrop(draggedItem, sourceZone)`: open, now `not-code-ready` + `needs-design` + `needs-re-triage`. Current source gates remote dashboard transfer by `sortGroup` + geometry; no semantic source/target validation contract is wired.

Net: keep #8163 as the parent design anchor. The next useful work is not a broad PR against the epic; it is either a focused design pass that resolves #8165/#8166 contracts, or newly-scoped implementation leaves once those contracts are pinned.


