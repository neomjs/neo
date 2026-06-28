---
id: 6932
title: Enhance StateProvider for Direct Record Property Binding
state: CLOSED
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - architecture
  - core
assignees:
  - neo-gpt
createdAt: '2025-07-01T19:53:13Z'
updatedAt: '2026-06-27T23:09:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6932'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-27T23:09:37Z'
---
# Enhance StateProvider for Direct Record Property Binding

**Is your feature request related to a problem? Please describe.**
Currently, when a `Neo.state.Provider` holds a `Neo.data.Record` instance in its `data` config, changes to individual properties within that record (e.g., `record.set('firstName', 'NewName')`) do not automatically trigger updates through the `StateProvider`'s binding system. Developers must manually proxy these changes by listening to record-level events (if they existed) and updating a separate `data` property in the `StateProvider`. This creates boilerplate and hinders seamless reactive binding to nested record properties.

**Describe the solution you'd like**
Enhance `Neo.state.Provider` to automatically detect `Neo.data.Record` instances within its `data` config and subscribe to their granular change notifications (assuming `Neo.data.Record` is enhanced to provide such notifications, as per a separate feature request). When a record's property changes, the `StateProvider` should propagate this change through its binding system, allowing components to directly bind to nested record properties using a syntax like `bind: { text: 'data.currentUser.firstName' }`.

This would involve:
1.  Detecting `Neo.data.Record` instances when they are assigned to `StateProvider`'s `data` properties.
2.  Subscribing to the record's granular change events (e.g., `fieldChange` or similar, once implemented in `Neo.data.Record`).
3.  Translating these record-level changes into `StateProvider`-level `onDataPropertyChange` notifications for the specific nested path (e.g., `data.myRecord.fieldName`).

**Describe alternatives you've considered**
The current alternative is to manually listen for changes on the record (if a mechanism existed) and then explicitly call `stateProvider.setData()` for the relevant property. This is verbose and defeats the purpose of a streamlined binding system.

**Additional context**
This feature is dependent on the implementation of granular change notifications within `Neo.data.Record`. It would significantly improve the developer experience for data-intensive applications, making it much easier to build reactive UIs that respond directly to changes in individual record fields.

## Timeline

- 2025-07-01T19:53:14Z @tobiu added the `enhancement` label
### @github-actions - 2025-09-30T02:38:17Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-09-30T02:38:17Z @github-actions added the `stale` label
- 2025-10-08T09:40:38Z @tobiu removed the `stale` label
- 2025-10-08T09:40:38Z @tobiu added the `help wanted` label
- 2025-10-08T09:40:38Z @tobiu added the `good first issue` label
- 2025-10-08T09:40:38Z @tobiu added the `no auto close` label
- 2025-10-08T09:40:38Z @tobiu added the `hacktoberfest` label
- 2026-06-23T05:18:04Z @neo-gpt added the `core` label
- 2026-06-23T05:18:04Z @neo-gpt added the `architecture` label
- 2026-06-23T05:18:08Z @neo-gpt removed the `good first issue` label
- 2026-06-23T05:18:08Z @neo-gpt removed the `hacktoberfest` label
### @neo-gpt - 2026-06-23T05:18:25Z

[ARCH_ALIGNMENT]

Fresh V-B-A triage: #6932 is valid after narrowing, but it is not a beginner/Hacktoberfest lane.

Evidence:
- The stated prerequisite exists and is closed: #6933 added the record-change seam. Source now has `Record.notifyChange()` as the single record field-change choke point, returning the payload after `setRecordFields()` (`src/data/RecordFactory.mjs` lines 278-295), and `record.set()` routes through it (`src/data/RecordFactory.mjs` lines 306-312).
- `setRecordFields()` builds `changedFields` and emits through `onRecordChange()` when non-silent changes happen (`src/data/RecordFactory.mjs` lines 494-554); `Neo.data.Store#onRecordChange()` exposes store-level `recordChange` with record index (`src/data/Store.mjs` lines 1148-1160).
- `Neo.state.Provider` already has the correct target substrate: data bindings are `Effect` based (`createBinding()` reads `getHierarchyData()`, `src/state/Provider.mjs` lines 323-358), nested data is routed through `setData()` / `internalSetData()` with bubbling (`src/state/Provider.mjs` lines 560-635), and path configs are created/updated in `processDataObject()` / `#setConfigValue()` (`src/state/Provider.mjs` lines 674-740).
- The current docs/tests cover plain provider data and stores, but not direct binding to `Neo.data.Record` fields. Verification run: `npm run test-unit -- test/playwright/unit/data/RecordFactory.spec.mjs test/playwright/unit/data/StorePush.spec.mjs` -> 6 passed.

Stage retrospective:
- Premise: pass. The gap is real; Provider data paths do not currently subscribe to record instance field changes.
- Prescription: pass after narrowing. Use the existing record-change seam and Provider path-config pipeline; do not make records Observable and do not invent a second binding system.
- Substrate: StateProvider/data integration, with tests under `test/playwright/unit/state/` plus existing data tests.

Required implementation guardrails:
- When a record is assigned to Provider `data`, register a per-record/per-path hook that translates changed fields into the matching Provider data paths, e.g. `currentUser.firstName`.
- Replacement and destroy cleanup are part of the contract. `Neo.util.Function.createSequence()` proves the seam, but it is append-only; an implementation must avoid retaining destroyed providers or stale record/path callbacks.
- Preserve atomic record assignment for the record object itself while exposing field-level path configs for bindings.
- Cover: initial record assignment, `record.set()` updating a bound field, nested path bubbling, record replacement, provider destroy cleanup, and silent updates not notifying bindings.

Routing:
- Added `core` and `architecture`.
- Removed `good first issue` and `hacktoberfest`; this crosses data records, StateProvider effects, cleanup, and binding invalidation.
- Kept `enhancement`, `help wanted`, and `no auto close`.

Triaged per `ticket-triage` skill. Stage retrospective passes for an experienced implementer with the guardrails above.

- 2026-06-27T22:04:07Z @neo-gpt added the `ai` label
- 2026-06-27T22:04:09Z @neo-gpt assigned to @neo-gpt
- 2026-06-27T22:13:55Z @neo-gpt referenced in commit `3e3825d` - "feat(state): bind provider data records by field (#6932)"
- 2026-06-27T22:14:03Z @neo-gpt cross-referenced by PR #14274
- 2026-06-27T23:09:37Z @tobiu closed this issue
- 2026-06-27T23:09:37Z @tobiu referenced in commit `2b180d1` - "feat(state): bind provider data records by field (#6932) (#14274)"

