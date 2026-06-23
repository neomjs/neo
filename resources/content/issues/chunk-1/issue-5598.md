---
id: 5598
title: 'selection.Model: select() => add support for widgets using a collection instead of a store'
state: OPEN
labels:
  - enhancement
  - no auto close
  - ai
  - core
assignees:
  - neo-gpt
createdAt: '2024-07-20T19:09:11Z'
updatedAt: '2026-06-23T04:50:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5598'
author: tobiu
commentsCount: 3
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
---
# selection.Model: select() => add support for widgets using a collection instead of a store

example: `form.field.Time` => creates a collection (can be discussed if it should be a store instead).

```
        items = (items = Array.isArray(items) ?
            items: [items]).map(item => item.isRecord ? view.getItemId(item) : Neo.isObject(item) ? item.id : item);
```

=> we need `view.getItemId(item)` for collection items as well.

inside the TimeField i added the hack to give items the `isRecord` flag as a workaround for now.

## Timeline

- 2024-07-20T19:09:11Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-19T02:31:18Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-19T02:31:18Z @github-actions added the `stale` label
- 2024-10-19T13:41:59Z @tobiu removed the `stale` label
- 2024-10-19T13:41:59Z @tobiu added the `no auto close` label
### @neo-gpt - 2026-06-23T04:47:02Z

[INTAKE_VALIDATED]

Fresh V-B-A pass says this issue is still live and implementation-ready, not a new-design or duplicate lane.

Evidence:
- `src/selection/Model.mjs` still converts selections via `item.isRecord ? view.getItemId(item) : Neo.isObject(item) ? item.id : item` in both `deselect()` and `select()`.
- `select()` only resolves records from ids through `view.getItemRecordId?.(item)` + `view.store?.get(recordId)`, which does not cover a raw collection item that lacks `isRecord` but can still be keyed by the view/store collection.
- `src/form/field/Time.mjs` still creates collection-backed list items with `isRecord: true`; that matches the workaround described in the ticket.
- Existing Time coverage validates the collection/list path, but I did not find focused coverage for base `selection.Model` accepting a collection item object without the `isRecord` flag.

Narrow implementation shape:
- Factor the incoming-selection id conversion in `Neo.selection.Model` into one helper used by `select()` and `deselect()`.
- Prefer the view's canonical item-id path when it can derive an id for an object (`view.getRecordId?.(item)` then `view.getItemId(...)`, or equivalent existing view helper), then fall back to the existing object `.id` behavior.
- Keep string/vdom id inputs unchanged, and keep the event `records` payload stable for store-backed selections.

Acceptance backstop:
- Add a focused unit test using a list/selection model with a collection-style item that has the configured key field but no `isRecord`, proving `select(item)` stores the generated vnode id and `deselect(item)` removes the same id.

No labels changed; the next author can claim this directly under #5598.

- 2026-06-23T04:50:15Z @neo-gpt added the `ai` label
- 2026-06-23T04:50:15Z @neo-gpt added the `core` label
### @neo-gpt - 2026-06-23T04:50:17Z

Triaged per `ticket-triage` skill. Applied: `ai`, `core`.

Stage retrospective passed: premise is still current against `src/selection/Model.mjs`; prescription stays inside the core selection substrate; consumer is framework component selection behavior; no service-boundary or ADR impact found. Assignment disposition: proceeding into ticket-intake / implementation under #5598.

- 2026-06-23T04:50:21Z @neo-gpt assigned to @neo-gpt
- 2026-06-23T04:59:53Z @neo-gpt cross-referenced by PR #13908

