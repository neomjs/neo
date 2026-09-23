# Workstation — Living Docking Showcase

Workstation is Neo.mjs's standalone dense-workspace flagship: twenty live panes, a renderer-rich
100,000-record grid, a capped feed ingesting ten records per second, real tab overflow, semantic
split-and-return docking, and a deterministic tour across dark and light themes.

It is an independent application under `apps/workstation/` with its own boot surface and theme.

## Run it

```bash
npm install
npm run build-themes -- -n -e dev -t all
npm run server-start
# → http://localhost:8080/apps/workstation/index.html
```

The non-interactive theme build creates the ignored development CSS and `theme-map.json`
artifacts a fresh checkout does not contain.

Ordinary docking, live panes, saving/restoring and theme controls work without activating playback.
The lightweight tour toolbar binds its caption and progress to the existing root state provider.
Its playback controller, runner and gesture drivers are created only when requested.

## Composition and ownership

[`view/Workspace.mjs`](view/Workspace.mjs) is the composition entrypoint. It declares the shipped
perspective and root provider, selects the three pane classes, and keeps the app's topology and
theme commands beside the state they use. Its constructor assembles the ordinary views and starts
the existing Feed store. No tour driver is needed for that boot.

| Owner | Responsibility |
|---|---|
| `view/VesselWorkspace.mjs` | App-specific Group, popup and native-vessel policy using the engine's existing owners; projection ordering and window-resource teardown. |
| `view/TopologyToolbar.mjs` | Topology controls and live Group history bindings; borrows the workspace's commands and provider. |
| `view/TourToolbar.mjs`, `view/StatusComponent.mjs` | Lightweight playback chrome and a readout bound directly to the existing stores. |
| `view/FeedPane.mjs`, `view/ScalePane.mjs`, `view/ResidentComponent.mjs` | The data views and resident presentation, with the same pane identities across docking. |
| `store/Feed.mjs` | One explicit-start producer, five records every 500 ms, monotonic IDs and the newest-first 500-record cap. Its timer retires with the store. |

The root provider owns stores it creates. Panes, toolbars and popup header providers borrow that
same store authority; a passed-in store remains its creator's responsibility. Native resources
retire before the composition releases its pane cache and services. The engine still owns Group
membership, document commits, history and generic window lifecycle.

The live feed's observation surface is now the store: `workspace.getStateProvider().getStore('feed')`
exposes `sequence`, `batchCount`, `batchSize` and `intervalMs`. `appendBatch()` adds one bounded batch;
`start()` and `stop()` control the store's single producer without resetting its records or sequence.
Neural Link readers can address `stateProvider.stores.feed.sequence` on the workspace. There is no
second counter on the view.

## Activate the optional tours

Two screenplays share one player.

**Start dense tour** opens the real overflow menu, scrolls the 100k grid, promotes a live pane
through `splitNode`, returns it through `addTab`, and flips both themes — no windows are opened.
Pane, store, component, and relevant DOM identities remain stable while the layout changes.

**Start film tour** plays the flagship film's eight scenes: the same cold open and drop-zone
showcase, then a pane that leaves the window into a real vessel mid-gesture and changes its mind
before the pointer lifts, the same pane torn out for good, a second pane that becomes a window
while dragged and docks into the first, the merged stack dragged home as one, a perspective
captured, torn apart and restored, one dock mutation undone and redone, and the closing readout.
Before every beat that opens a window the tour stops at a gate and shows **Continue**: that click
is the user activation the browser demands for `window.open`, so the window is born inside your
gesture rather than blocked as a popup. Two measured preconditions shape the screenplay: a tab
folded into a tab bar's overflow menu is not a drag handle, and a torn-out pane's stored home must
survive its departure for the stack to return to it.

Both data-only screenplays live in `apps/workstation/tour/` (`denseWorkstation.mjs`,
`fiveBeatFilm.mjs`); the mounted whitebox journeys are the runtime and visual falsifiers, and the
film take (`NEO_FILM_TAKE=1`) records the same runnable script.

For programmatic playback from outside the view, resolve the optional owner with
`await workspace.getController().getTourController()`, then call its `startTour()`,
`startFilmTour({autoGates})`, `continueTour()`, `runTourSpec()` or `getTourReceipt()`.
`cancelTour()` retires that playback controller and waits for its started cue work; a later Start
creates a fresh controller. The workspace and its stores remain owned by the ordinary application.

## Layout controls and persistence

Two rows keep the workspace chrome compact: tour and theme controls above, live store statistics
beside **Reset to default**, **Undo** and **Redo** below. Undo and Redo retain their reactive step
badges. Opening more popup participants adds no controls or rows.

Group commits automatically store the complete keyed topology in IndexedDB, separately from undo history.
Each logical root has its own collection. Cold boot uses its saved active layout; `?layout=<id>`
explicitly selects another record in that collection. An unusable selection offers **Start a new
workspace**, which preserves the saved collection and creates a new root.

Use a pane's pop-out action or tear-out gesture to open its native window, and the browser's
close control to close it. A closed or cold-restored popup remains a retained participant.
**Reset to default** brings the shipped panes back to their default arrangement; **Undo** can reverse
a preceding tear-out while that history still exists. Cold boot starts with empty history.
Reloading a root or a restored popup while its SharedWorker survives reuses the live Workspace,
host and pane instances without replaying history or writing a new topology.

The underlying `saveTopology()`, `openTopologyWorkspace()`, `mountTopologyWorkspace()` and
`closeTopology()` commands remain available to programmatic consumers. They are not additional
toolbar actions; layout-preserving recovery of a headless participant is a programmatic path.
