# Discussion Lifecycle Closure Audit

## Trigger Matrix

| Marker / lifecycle state | Whole-Discussion action | Reason |
|---|---|---|
| Any explicit `[GRADUATED_TO_TICKET: #N]` marker | Close Discussion | `RESOLVED` |
| All Open Questions are terminally resolved (`[RESOLVED_TO_AC]`, `[GRADUATED_TO_TICKET]`, `[DEFERRED_WITH_TIMELINE]`, or `[REJECTED_WITH_RATIONALE]`) and no graduation criteria remain open | Close Discussion | `RESOLVED` |
| Some Open Questions are resolved, while any scope remains `[OQ_RESOLUTION_PENDING]`, `[CONVERGING]`, or explicitly deferred to another cycle | Keep open | active ideation |
| No graduation marker and no activity for 90 days | Flag for maintainer stale-archive review; close only after review | `OUTDATED` |

## Semantics

`[RESOLVED_TO_AC]` is an Open-Question marker, not automatically a whole-Discussion graduation marker. A Discussion with partial OQ resolution remains open until every OQ and graduation criterion has an explicit terminal disposition.

A Discussion with all OQs terminally resolved and no remaining scope is whole-Discussion-resolved and should close `RESOLVED`, even when no standalone ticket was needed.

The mechanical guard is read-only by design. `npm run ai:audit-discussion-lifecycle` reports required lifecycle actions, but never closes Discussions, edits Discussion bodies, or posts GitHub comments.
