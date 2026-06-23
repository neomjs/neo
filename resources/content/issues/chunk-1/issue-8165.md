---
id: 8165
title: Implement Configurable Theme Inheritance for Dragged Items
state: OPEN
labels:
  - enhancement
  - no auto close
  - ai
  - needs-re-triage
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2025-12-27T21:33:10Z'
updatedAt: '2026-06-23T03:53:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8165'
author: tobiu
commentsCount: 2
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Implement Configurable Theme Inheritance for Dragged Items

When dragging items between different browser windows (apps) that may have different themes (e.g., Dark Mode vs Light Mode), we need a configurable strategy for how the dragged item appears.

**Goal:**
Implement a `themeMode` config (e.g., `'adapt' | 'retain'`) on the Draggable/SortZone definition.
*   **Adapt:** The item temporarily or permanently adopts the CSS variables/theme of the target window context.
*   **Retain:** The item enforces its original theme (useful for "stickers" or branding).

**Current Behavior:**
The proxy clones the DOM/VDOM, likely carrying over classes, but if CSS variables are missing in the target, it may look broken.

## Timeline

- 2025-12-27T21:33:11Z @tobiu added the `enhancement` label
- 2025-12-27T21:33:11Z @tobiu added the `ai` label
- 2025-12-27T21:33:48Z @tobiu added parent issue #8163
### @github-actions - 2026-03-28T03:54:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-28T03:54:37Z @github-actions added the `stale` label
- 2026-03-28T05:57:14Z @tobiu removed the `stale` label
- 2026-03-28T05:57:14Z @tobiu added the `no auto close` label
- 2026-06-23T03:53:38Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:53:38Z @neo-gpt added the `needs-design` label
- 2026-06-23T03:53:38Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T03:53:55Z

[ARCH_ALIGNMENT] Maintenance triage per `ticket-triage` skill. Applied: `not-code-ready`, `needs-design`, `needs-re-triage`.

I am not closing this and I did not find a direct successor/duplicate in the live sweep. The capability still belongs under the #8163 cross-window DnD/topology family, but it is not code-ready as written because the proposed `themeMode: 'adapt' | 'retain'` contract cuts across drag proxy creation, live widget transfer, per-window theme loading, and remote dashboard reintegration.

Fresh checks on 2026-06-23:

- `themeMode` is not implemented anywhere under `src/`, `apps/`, or `test/`.
- `src/dashboard/Container.mjs` already exposes `dragProxyExtraCls` and `sortGroup`, then passes `DragProxyContainer`, extra classes, popup behavior, and `sortGroup` into the dashboard SortZone. That is the current configuration seam, not a theme inheritance contract.
- `src/draggable/DragZone.mjs` creates proxy config from the dragged element/component and pushes the component theme class into the proxy classes.
- `src/draggable/DragProxyContainer.mjs` already forces `Neo.draggable.DragProxyComponent` theme files into the target `windowId`.
- `src/worker/App.mjs#insertThemeFiles(windowId, proto, className)` is the existing per-window theme loading primitive, including parent-prototype traversal and `additionalThemeFiles`.
- `src/draggable/dashboard/SortZone.mjs#acceptsRemoteDrag()` and `src/manager/DragCoordinator.mjs` are geometry/reintegration gates today; they do not carry semantic theme policy.
- Existing dashboard SortZone coverage checks titlebar dwell/settle reintegration and geometry, not adapt/retain theme semantics.

Before this should become an implementation lane, the design needs to pin down:

1. Config ownership: generic `DragZone`/`SortZone`, dashboard-only `Dashboard.Container`/dashboard SortZone, or item-level metadata.
2. Scope of the mode: proxy-only while dragging, permanent live-widget transfer, or both.
3. `adapt` semantics: target app/window theme class, target CSS variables, target `windowConfigs`, and whether missing source-only CSS should be dropped or loaded.
4. `retain` semantics: how a dragged live component keeps source-theme rules after being mounted into the target window without leaking unrelated source app styling.
5. The interaction with `insertThemeFiles()` and the existing manual precedent in the shared-dialog docking code, where required component theme files are explicitly inserted into the docked window.
6. Failure/fallback behavior when the source theme folder does not exist in the target app theme map.
7. Evidence shape: focused unit coverage around proxy config/theme-file insertion plus a cross-window visual/runtime check for at least one adapt case and one retain case.

Stale nuance: the ticket was touched by stale-bot on 2026-03-28 and has `no auto close`, so it is intentionally parked, not abandoned. The exemption should preserve the design discussion, but it should not signal that a narrow code patch can start without the contract above.

- 2026-06-23T03:56:38Z @neo-gpt cross-referenced by #8163

