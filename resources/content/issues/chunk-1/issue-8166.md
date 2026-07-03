---
id: 8166
title: Implement Cross-Window Drop Validation and Topology Rules
state: OPEN
labels:
  - enhancement
  - no auto close
  - ai
  - needs-re-triage
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2025-12-27T21:33:19Z'
updatedAt: '2026-06-23T03:46:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8166'
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
# Implement Cross-Window Drop Validation and Topology Rules

For complex workspaces (like AgentOS), we need granular control over which dashboards can receive items from which sources.

**Current State:**
We use `sortGroup` string matching. This is binary (all-or-nothing).

**Goal:**
Implement a robust validation hook or Topology Manager.
*   **Validator Hook:** `allowDrop(draggedItem, sourceZone, targetZone) => boolean`.
*   **Use Cases:**
    *   Prevent dropping "System Widgets" into "User Content" areas.
    *   Allow Child -> Parent drops, but block Parent -> Child.
    *   Enforce "One instance only" rules.

## Timeline

- 2025-12-27T21:33:20Z @tobiu added the `enhancement` label
- 2025-12-27T21:33:20Z @tobiu added the `ai` label
- 2025-12-27T21:33:50Z @tobiu added parent issue #8163
### @github-actions - 2026-03-28T03:54:35Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-28T03:54:35Z @github-actions added the `stale` label
- 2026-03-28T05:57:38Z @tobiu removed the `stale` label
- 2026-03-28T05:57:38Z @tobiu added the `no auto close` label
- 2026-06-23T03:46:10Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:46:11Z @neo-gpt added the `needs-design` label
- 2026-06-23T03:46:11Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T03:46:29Z

[ARCH_ALIGNMENT]

Ticket-intake classification on 2026-06-23: **valid intent, but not code-ready as written**. Preserved open, excluded from branch pickup.

Evidence checked:
- Live issue state: #8166 was created on 2025-12-27, last updated on 2026-03-28, has no assignee, and carries `no auto close`.
- Stale-band nuance: by current `updatedAt`, #8166 is **pre-stale** under `.github/workflows/close-inactive-issues.yml` (90-day stale / 14-day close), but it also has a 2026-03-28 stale-bot comment and `no auto close`; that means the lane was explicitly parked after stale handling. The exemption is not readiness evidence.
- Parent/topology context: #8163 is the open epic for Cross-Window Drag & Drop Refinement & Topology and explicitly calls for asymmetric sender/receiver rules plus `allowDrop(draggedItem, sourceZone)` hooks.
- Live duplicate/PR sweep found no PR completing #8166 and no direct successor. #8156/#8159/#8161/#8172 are earlier/foundational or inspection work, not this semantic drop policy contract.
- Current source check:
  - `src/dashboard/Container.mjs` still exposes only `sortGroup` for dashboard grouping and passes it into the dashboard `SortZone`.
  - `src/manager/DragCoordinator.mjs` routes remote drag targets by `sortGroup` and geometry, then calls `targetSortZone.acceptsRemoteDrag(localX, localY)`.
  - `src/draggable/dashboard/SortZone.mjs#acceptsRemoteDrag()` is geometry-only hit testing; it does not receive `draggedItem`, `sourceZone`, or topology metadata.
  - Unit coverage in `test/playwright/unit/draggable/dashboard/SortZone.spec.mjs` covers terminal/native/window-drag geometry paths, but not semantic allow/deny topology.

Reason for not-code-ready: the ticket offers two possible shapes (`allowDrop` hook or Topology Manager), but does not define the consumed contract. Before implementation, we need a design/contract ledger for at least:

| Surface | Decision needed |
|---|---|
| `DashboardSortZone.acceptsRemoteDrag` vs new `allowDrop` | Whether geometry hit-testing and semantic topology validation stay separate, and the exact call order. |
| `DragCoordinator` target resolution | Whether rejected semantic drops should behave like void, terminal popup, source resume, or a distinct rejection event. |
| Hook signature | Exact args: `draggedItem`, `sourceZone`, `targetZone`, source/target dashboard ids, window ids, current index, and async support or sync-only. |
| Config surface | Where rules live: dashboard container config, sort zone config, central topology manager, or per-item metadata. |
| One-instance rules | How existing/detached/popup-held instances are counted and how rejection is reported. |
| Parent/child asymmetry | How source/target ancestry is represented without hard-coding AgentOS dashboard names. |
| Evidence | Unit tests for geometry-allowed but topology-denied, topology-allowed remote drop, native-titlebar drop rejection, source resume, and no duplicate detached state. |

Applied labels: `not-code-ready` + `needs-design` + `needs-re-triage`.

- 2026-06-23T03:56:38Z @neo-gpt cross-referenced by #8163

