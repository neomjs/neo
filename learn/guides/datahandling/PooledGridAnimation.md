# Pooled Grid Animation Contract

Neo grids virtualize rows by recycling a fixed DOM pool. That is the right default for
scrolling, but it changes the animation contract: row transitions must not assume that
logical records own stable DOM rows.

This guide records the design contract for animating TreeGrid structural changes under
pooled rows. It is intentionally a contract first, not visual tuning. Easing, duration,
and stagger only matter after the renderer and data-layer invariants are preserved.

## Decision

Use a snapshot overlay for TreeGrid expand and collapse animation.

The `TreeStore` keeps its current synchronous projection semantics. `expand()` and
`collapse()` continue to mutate the visible flat projection immediately, and bulk
operations continue to rebuild the projection and fire one `load` event. The grid body
then renders the final state through the normal pooled row layer, while a temporary
overlay owns the visual transition for the affected viewport rows.

The overlay is a visual artifact, not a second data source. It captures before and after
row geometry, paints only during the transition window, and is removed once the animation
finishes or is cancelled.

Snapshot overlay is accepted because it keeps data truth and visual continuity separate:
the store remains immediately correct, the pooled row layer remains the only live
interactive layer, and animation cancellation can discard a stale overlay without
rolling back data or replaying queued mutations.

## Source Contracts

| Contract | Source | Required behavior |
| --- | --- | --- |
| Fixed row pool | `src/grid/Body.mjs#createRowPool()` | VDOM children remain aligned to the full row pool. Animation must not remove, append, or reorder pooled row VDOM nodes. |
| Modulo row identity | `src/grid/Body.mjs#getRowId()` | Physical row ids are slot ids, not record ids. Tree structural animation must not key movement by pooled row ids. |
| View projection | `src/data/TreeStore.mjs#expand()` and `src/data/TreeStore.mjs#collapse()` | Projection mutation stays immediate for ordinary TreeStore use. No async-only TreeStore path is introduced. |
| Bulk projection | `src/data/TreeStore.mjs#expandAll()` and `src/data/TreeStore.mjs#collapseAll()` | Large projection rebuilds may fall back to no animation or a bounded viewport overlay. They must not emit per-node splice storms. |
| Existing plugin | `src/grid/plugin/AnimateRows.mjs` | `AnimateRows` remains a flat-store row sorting/filtering plugin until it is repaired behind the shared pooled-grid contract. |

## Rejected Alternatives

### Delayed permutation

Rejected for the first TreeGrid substrate.

Delayed permutation would expose structural mutation intent, animate the visual gap, and
commit the TreeStore splice after the transition. That makes an ordinary data operation
depend on animation lifecycle timing. It also adds queueing questions for selection,
filters, sorting, async child loading, `singleExpand`, rapid toggles, and bulk
`expandAll()` / `collapseAll()`. The existing TreeStore contract is cleaner: the data
layer commits the truth immediately, and the view decides how much of that change can be
animated.

### Current `AnimateRows` enablement

Rejected for TreeGrid structural changes.

`AnimateRows` maps VDOM rows by `row.id`, pushes inserted VDOM rows, fades leftovers, and
later forces `owner.createViewData()`. That can work for flat row sorting, but it fights
the current grid body contract where `row.id` is a modulo pool slot. Enabling it for
TreeGrid expand/collapse would create a second row lifecycle over a renderer that
intentionally keeps the pool stable.

### Global transform transitions

Rejected.

Normal virtual scrolling updates pooled rows with transforms. A global
`transition: transform` on grid rows would animate ordinary scroll recycling, making
scrolling lag behind the user's input. Structural animation must be explicitly scoped to
the overlay or to a future animation layer that can distinguish scroll movement from
TreeStore projection changes.

## Snapshot Overlay Requirements

1. Capture the visible viewport before the TreeStore mutation. The capture keys logical
   records through record identity, not pooled row ids.
2. Let the TreeStore mutation commit immediately.
3. Render the grid body in its final state through `createViewData()`.
4. Capture the post-mutation viewport geometry.
5. Animate an overlay for rows that entered, exited, or moved within the affected
   viewport.
6. Remove the overlay on transition end, scroll, store load/filter/sort, resize, or any
   subsequent structural mutation that would make the snapshot stale.

The overlay must not intercept selection, focus, or row toggle interaction. During an
active transition, user input continues to target the live pooled row layer.

## Guardrails

- TreeGrid must not add `.neo-tree-row-entering` / `.neo-tree-row-leaving` as a parallel
  row lifecycle over pooled rows.
- `animatedRowSorting` remains off by default for TreeGrid.
- Bulk expand/collapse may use a bounded viewport overlay or skip animation entirely.
  The fallback must be explicit and deterministic.
- Rapid toggle, scroll, resize, load, filter, and sort cancel the current overlay before
  the next render decision.
- Async child loading animates only after children are available and the projection
  changes. Loading state itself is outside this contract.
- Selection is validated by record identity after the structural change, not by physical
  row slot.

## Verification Contract

The first runtime PR that implements this contract must verify the following paths with
the chosen animation config enabled:

- `test/playwright/e2e/GridTree.spec.mjs`
- `test/playwright/e2e/GridTreeBigData.spec.mjs`

The verification must cover:

- single expand and collapse
- mixed expand, collapse, and sort sequences
- bulk expand all followed by individual collapse
- bulk collapse all
- selection persistence after structural changes
- rapid toggle or explicit cancellation behavior
- scroll during an active transition or explicit cancellation behavior

If a behavior is intentionally non-animated, the test should assert the fallback contract
rather than only asserting the final visual state.

## Implementation Notes

Future data-layer hooks for mutation intent or commit timing must include JSDoc and
`@summary` coverage. The preferred path does not require such hooks for the first slice:
the grid can treat TreeStore projection changes as immediately committed data and keep
animation lifecycle inside the view layer.

The implementation should also narrow or repair `AnimateRows` before exposing it to
TreeGrid. A safe narrow path is to keep it documented as a flat-store row sorting plugin
until the shared overlay layer exists.
