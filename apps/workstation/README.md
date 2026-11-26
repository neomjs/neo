# Workstation — Living Docking Showcase

Workstation is Neo.mjs's standalone dense-workspace flagship: twenty live panes, a renderer-rich
100,000-record grid, a capped feed ingesting ten records per second, real tab overflow, semantic
split-and-return docking, and a deterministic tour across dark and light themes. A second
arrangement, **Planning**, shows one set of work items as a board and as a schedule, beside the release
plan they serve.

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

[`view/Workspace.mjs`](view/Workspace.mjs) is the composition entrypoint. It declares the two
arrangements (the shipped perspective and `planning`) and the root provider, selects the pane
classes, and keeps the app's topology and theme commands beside the state they use. Its constructor
assembles the ordinary views and starts the existing Feed store. No tour driver is needed for that boot.

| Owner | Responsibility |
|---|---|
| `view/VesselWorkspace.mjs` | App-specific Group and native-vessel policy, window presentation and receipts; consumes the engine's shared popup return and replay. |
| `view/TopologyToolbar.mjs` | Topology controls and live Group history bindings; borrows the workspace's commands and provider. |
| `view/TourToolbar.mjs`, `view/StatusComponent.mjs` | Lightweight playback chrome, the arrangement switch, and a caption and readout that state the arrangement on screen, bound directly to the existing stores. |
| `view/FeedPane.mjs`, `view/ScalePane.mjs`, `view/ResidentComponent.mjs` | The data views and resident presentation, with the same pane identities across docking. |
| `view/BoardPane.mjs`, `view/SchedulerPane.mjs`, `view/GanttPane.mjs`, `view/planningCalendar.mjs` | The planning panes: the team's work items as cards by status and as bars by person and day, and the release plan with its cascading links. The schedule and the plan share one calendar: one window, scale, locked width and label format, which the cards name their days in. |
| `store/Feed.mjs` | One explicit-start producer, five records every 500 ms, monotonic IDs and the newest-first 500-record cap. Its timer retires with the store. |
| `store/plan.mjs`, `store/WorkItems.mjs`, `store/People.mjs`, `store/PlanTasks.mjs`, `store/PlanLinks.mjs` | The seeded plan, as whole-day offsets from one UTC day, and the stores it seeds. `WorkItems` is the one record store the schedule and the board read. |

The root provider owns stores it creates. Panes, toolbars and popup header providers borrow that
same store authority; a passed-in store remains its creator's responsibility. Native resources
retire before the composition releases its pane cache and services. The engine still owns Group
membership, document commits, history and generic window lifecycle.

The live feed's observation surface is now the store: `workspace.getStateProvider().getStore('feed')`
exposes `sequence`, `batchCount`, `batchSize` and `intervalMs`. `appendBatch()` adds one bounded batch;
`start()` and `stop()` control the store's single producer without resetting its records or sequence.
Neural Link readers can address `stateProvider.stores.feed.sequence` on the workspace. There is no
second counter on the view.

## Activate the visitor tour and scripted screenplays

One visitor-facing **Start tour** action launches the product tour (`apps/workstation/tour/denseWorkstation.mjs`): it opens the real overflow menu, scrolls the 100k grid, crosses live drop zones, promotes a pane through `splitNode`, returns it through `addTab`, and flips both themes — no windows are opened. Pane, store, component, and relevant DOM identities remain stable while the layout changes.

The flagship film screenplay (`apps/workstation/tour/fiveBeatFilm.mjs`) shares the same player and remains accessible to capture and test callers through the tour driver (`startFilmTour({autoGates})`), without adding a second visitor launcher to the toolbar. It plays ten multi-window scenes: a pane leaves the window into a real vessel mid-gesture and stays; a second pane crosses every boundary under one pointer-down; the merged stack returns home as one; a pane folds into its edge rail and comes back; the main boundary follows a real pointer drag; the drop-zone showcase commits a cross-zone move; a perspective is captured, torn apart and restored with undo and redo; the saved two-window arrangement is restored, its window born again around both panes, then its stack dragged home; and the hundred-thousand-row grid scrolls through its midpoint while the feed keeps ticking. Before every beat that opens a window the tour stops at a gate and reveals **Continue**: that click is the user activation the browser demands for `window.open`, so **Continue** is visible only while a gate is pending. One click covers one activation; further births inside a single held drag rest on the site's pop-up permission (or degrade to the in-window proxy).

A cue that fails stops the tour at that beat, with the failed cue's receipt in the tour receipt.

For programmatic playback from outside the view, resolve the optional owner with
`await workspace.getController().getTourController()`, then call its `startTour()`,
`startFilmTour({autoGates})`, `continueTour()`, `runTourSpec()` or `getTourReceipt()`.
`cancelTour()` retires that playback controller and waits for its started cue work; a later Start
creates a fresh controller. The workspace and its stores remain owned by the ordinary application.

## Layout controls, header action ownership, and persistence

Two global header rows keep the workspace chrome compact:
- **Row 1 (`view/TourToolbar.mjs`):** **Start tour**, conditional **Continue** (while a viewer gate is pending), **Operations** / **Planning** (when both arrangements are declared), **Commands** (contextual command palette, also reachable via `Ctrl+K` / `Meta+K` / `F1`), and the theme toggle (**Light mode** / **Dark mode**).
- **Row 2 (`view/TopologyToolbar.mjs` beside `view/StatusComponent.mjs`):** live store statistics beside **Reset to default**, **Undo**, and **Redo** (with reactive step badges). Opening more popup participants adds no controls or rows.

**Action placement rule:** a new demo, capture, or test scenario uses the tour runner (`TourController`) or test fixture rather than adding a launcher to the global headers; a new product function belongs where a person uses it. Any deliberate change to the global header actions updates this section and [`test/playwright/e2e/workstation/WorkstationTourActivationNL.spec.mjs`](../../test/playwright/e2e/workstation/WorkstationTourActivationNL.spec.mjs) together.

**Operations** and **Planning** switch between the declared arrangements. A switch is one Group
commit that names the arrangement, so **Undo** returns the previous one and a save records it. In
the same commit every window gives back its panes: those the next arrangement lists come home, the
rest leave with the arrangement they belong to, so no window docks a pane into the wrong one.
**Reset to default** restores the arrangement the workspace is in. A window either write empties
closes, and **Undo** reopens it. A tour always starts from the shipped arrangement.

Group commits automatically store the complete keyed topology in IndexedDB, separately from undo history.
Each logical root has its own collection. Cold boot uses its saved active layout; `?layout=<id>`
explicitly selects another record in that collection. An unusable selection offers **Start a new
workspace**, which preserves the saved collection and creates a new root.

Use a pane's pop-out action or tear-out gesture to open its native window, and the browser's
close control to close it. Closing a popup returns its panes to main in one Group transaction:
surviving original tab homes keep their positions, and other panes join an existing main stack.
**Undo** reopens the popup with its panes; **Redo** returns them and closes it again. Reloading a
popup does not return its panes. If an opener reload lost the native handle, recovery waits for
the popup's reconnect lease to expire. Cold-restored popups remain retained participants until
opened or restored. Cold boot starts with empty history.
Popup hosts select the engine's `nativeWindowClosePolicy: 'return'` and the `main` binding as their
destination. `WorkspaceSet.returnWorkspace` owns the paired document write, while
`NativeVesselTransaction` observes closure and replays native effects. Workstation supplies its
landing policy, window URL and presentation; see [Dock window composition](../../learn/guides/uibuildingblocks/DockLayoutsWindows.md).
Reloading a root or a restored popup while its SharedWorker survives reuses the live Workspace,
host and pane instances without replaying history or writing a new topology.

The underlying `saveTopology()`, `openTopologyWorkspace()`, `mountTopologyWorkspace()` and
`closeTopology()` commands remain available to programmatic consumers. They are not additional
toolbar actions; layout-preserving recovery of a headless participant is a programmatic path.
