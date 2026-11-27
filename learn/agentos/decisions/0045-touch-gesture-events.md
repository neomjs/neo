# ADR 0045: Touch gesture events, their teardown and replay

> Main recognizes six gesture families, and only on nodes that registered for them. App receives them through the normal listener surface as `<family>:<phase>` events and owns every outcome. The browser keeps every contact sequence it takes. One serializable contact trace replays a gesture through Neural Link and Playwright, and the result names the provider and what that provider can prove.

| Attribute | Value |
|---|---|
| **Status** | Accepted, 2026-11-27 (#22401). Graduated from [Discussion #22259](https://github.com/orgs/neomjs/discussions/22259) at body revision G2, at quorum: GPT ([Emmy](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961906), author signal), Claude ([Ada](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961924); [Grace](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961949), with the [eight-point step-back](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961870)), Gemini ([Julia](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19962174), extending her [G1 step-back](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961921) to G2). |
| **Author** | @neo-opus-grace (Grace, Claude Opus 5.5, Claude Code), from the #22259 record: Emmy's proposal, inventory and three-provider receipt; Vega's four-owner analysis; Maryam's demand-gated recognizer and traffic control; Ada's listener census, Chromium controls and physical-policy folds; Julia's replay options and step-back; Euclid's late-join case; Clio's scope split. |
| **Implemented by** | The input/replay epic of #22259 |
| **Depends on** | Pointer Events `touch-action` and `pointercancel`; Touch Events `cancelable`. The App listener mount in `src/manager/DomEvent.mjs`; `EventSimulator` in `src/main/addon/`. |
| **Connects to** | ADR 0044 (visual roles, untouched) · [Discussion #20308](https://github.com/orgs/neomjs/discussions/20308) (Gallery and Helix) · #22396 / #22399 (the shared staggered-cancel replay) · #22345 (touch lists built in the owning window) · #505 (the original touch proposal) |
| **Anti-anchor for** | a recognizer on every element · semantic recognition in App from raw forwards · a gesture name in `globalDomEvents` · `tap` in place of `click` · a grid-wide `touch-action: none` default |

## 1. Context

Measured on `dev` at `5ff17dedc8`:

1. **No gesture event exists.** Each consumer reads raw touch its own way. Helix maps one finger to rotation and depth ([`Helix.mjs:1008`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/component/Helix.mjs#L1008)). Circle reads only the wheel. GridDragScroll watches a contact and promotes it to a JS drag after a hold ([`GridDragScroll.mjs:427`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/addon/GridDragScroll.mjs#L427)).
2. **Two non-passive `touchmove` listeners exist before contact in every default app.** One is the body's ([`DomEvents.mjs:31`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/DomEvents.mjs#L31)), whose only cancel is a Helix path test ([`TouchDomEvents.mjs:95`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/mixin/TouchDomEvents.mjs#L95)). The other is the drag sensor's window listener ([`Pointer.mjs:119`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/draggable/sensor/Pointer.mjs#L119)); DragDrop is a default addon ([`DefaultConfig.mjs:190`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/DefaultConfig.mjs#L190)).
3. **The body forwards every raw `touchmove` to App**, whether or not App listens ([Maryam's control](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19931696): 8 moves, 8 messages).
4. **Main already recognizes one gesture.** The drag sensor arms after `touchDelay` (200 ms), and DragDrop sends `drag:start|move|end|cancel` to App ([`DragDrop.mjs:327-353`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/addon/DragDrop.mjs#L327-L353)). Those four names are global events ([`manager/DomEvent.mjs:35`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/manager/DomEvent.mjs#L35)).
5. **Per-node registration has two shapes.** A non-global name mounts through `addDomListener`, which keeps no handler and has no removal ([`main/DomEvents.mjs:220-243`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/DomEvents.mjs#L220-L243)). `resize` takes its own branch: App fetches the ResizeObserver addon with `getAddon` and calls `register` ([`manager/DomEvent.mjs:130-141`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/manager/DomEvent.mjs#L130-L141)). That addon also exposes `unregister`, and nothing calls it on unmount.
6. **Replay works on today's input.** EventSimulator builds touch lists in the owning window (#22345). `driveDrag` drives a timed sequence under a mutex ([`EventSimulator.mjs:396-413`](https://github.com/neomjs/neo/blob/5ff17dedc8/src/main/addon/EventSimulator.mjs#L396-L413)). The same eight transitions ran 8/8 through the public MCP, the fixture and CDP ([receipt](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961766)).

## 2. Decision

1. **Four owners per gesture.**
   - **Policy before contact:** the component, through `touch-action` in its structural CSS (`resources/css/src/**`, never a theme sheet). Hold-to-drag also keeps the drag sensor's non-passive window listener, because `touch-action` is fixed at contact start and cannot express a delayed claim.
   - **Recognition:** Main, in the owning window, only on registered nodes (decision 4).
   - **Motion:** an existing Main addon where frame response requires it (GridDragScroll's held drag and inertia); otherwise App, from the phases.
   - **Commit:** App, for component state, Store records and selection.
   - **Browser:** native page scroll, zoom and eligible edge navigation.

   | Consumer | Policy | Recognition | Motion and commit |
   |---|---|---|---|
   | Gallery | horizontal surface; the page keeps vertical scroll and pinch | `swipe` at release | App selects exactly one neighbour per accepted swipe |
   | Helix | `pan-y`, compared on device | horizontal `pan`; `pinch` | App: rotation from `pan`, depth from `pinch`; a partial lift rebases |
   | Circle | `pan-x pan-y`, compared on device | `rotate` on two contacts | App: bounded rotation and item index |
   | Grid | unchanged | the browser owns a quick stroke; GridDragScroll owns a held drag | App owns rows and record actions |

2. **Six families, two event shapes.** The families are `tap`, `press`, `pan`, `swipe`, `pinch` and `rotate`.

   | Family | Events |
   |---|---|
   | `tap` | `tap` (terminal) |
   | `swipe` | `swipe` (terminal) |
   | `press` | `press:start`, `press:end`, `press:cancel` |
   | `pan`, `pinch`, `rotate` | `<family>:start`, `<family>:move`, `<family>:end`, `<family>:cancel` |

   No gesture name is in `globalDomEvents`, and a unit test asserts it. `tap` and `swipe` are single terminal events: no phase, and nothing before or after them. A phased gesture has exactly one `start`, then any number of `move`s, then exactly one `end` or `cancel`, and nothing after; `press` has no `move`. `pinch` and `rotate` may run at once on one node, each in its own order.

3. **One payload, in CSS pixels and milliseconds.**

   | Field | Meaning |
   |---|---|
   | `gestureId` | unique per window, the same on every phase of one gesture |
   | `phase` | `start`, `move`, `end` or `cancel`, on phased families |
   | `pointerType` | `touch`, `pen` or `mouse` |
   | `contacts` | the active contacts as `{id, x, y}`; `id` counts from 0 within the gesture and is never `Touch.identifier` |
   | `changed` | the ids whose state changed in this event |
   | `x`, `y` | the focal point, the centroid of the active contacts, relative to the target's border box |
   | `elapsed` | ms since the gesture's first contact went down |

   Every value is finite on every event. When the last contact lifts or cancels, `end` and `cancel` carry an empty `contacts`, the lifted ids in `changed`, and `x`/`y` at the last focal point.

   Per family: `tap` adds `count` (repeats) and `contactCount` (the chord). `press:end` adds `duration`. `pan` adds `deltaX`/`deltaY` (total), `stepX`/`stepY` (since the previous event) and `velocityX`/`velocityY` in px/ms. `swipe` adds `direction` (`left`, `right`, `up`, `down`) and both velocities. `pinch` adds `scale`, the distance ratio, starting at 1. `rotate` adds `rotation` in signed degrees, starting at 0, positive clockwise. When the contact count changes, totals keep their values and the focal, distance and angle baselines are taken again, so nothing jumps. `pinch` and `rotate` end when fewer than two contacts remain; a `pan` continues on the survivor.

4. **Per-node registration with an explicit release.** Gesture names take their own branch in App's listener mount, as `resize` does. A listener on a gesture name makes App fetch the Main gesture addon with `getAddon` and call `register({componentId, id, windowId, events})`. App calls `unregister` when the listener is removed and when the component unmounts (`resetMountedDomListeners`). Registrations are counted per window, component and event name: several listeners register once, and the last removal unregisters. The addon recognizes only on registered nodes and delivers through the same Main → App event message DragDrop uses. It is not a default main-thread addon, so an app without a gesture listener never loads it and gets zero recognition messages by construction.

5. **One recognition owner, logical delivery.**
   - **Recognition is scoped to DOM.** A gesture belongs to the innermost registered node, subscribed to that family, that contains the first contact's start point in the owning window. Only that node's recognizer tracks the contacts, and only its motion owner moves anything. A later contact joins only if it starts inside the owning node. Touch keeps its start target. Pen and mouse take `setPointerCapture` from `start` until the terminal phase.
   - **Delivery is logical.** The recognized event fires through App's `DomEvent.fire` along `ComponentManager.getParentPath`. A logical ancestor with a listener for the same name receives it too, under the usual `bubble` rules, and neither recognizes nor moves anything.
   - **A portalled child needs its own registration.** A child rendered under `body` lies outside its logical parent's DOM subtree, so a subscription on the parent alone recognizes nothing on that child.

6. **Teardown cancels without commit.** An open gesture ends in `cancel`, once and with nothing after it, when any of these happens:
   - its node is unregistered or removed from the document;
   - one of its contacts gets `touchcancel` or `pointercancel`;
   - the document becomes hidden;
   - the window closes (`pagehide`).

   When App loses a window, it cancels every gesture still open there. A consumer restores its last committed state on `cancel` wherever it keeps one.

7. **The browser keeps what it takes.** A contact sequence becomes browser-owned when the browser sends `pointercancel` for any of its pointers. An uncancelable `touchmove` is not that signal. With passive observers on a `pan-y` surface, a horizontal stroke the browser leaves alone arrives uncancelable too ([Emmy's control](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19962224)). That stroke sent 5 uncancelable moves, no `pointercancel` and a `pointerup`, and scrolled 0 px. The vertical stroke sent one `pointercancel` and scrolled 134 px.

   A browser-owned sequence starts no gesture, and a gesture already open in it ends in `cancel`. Ownership holds until the last contact of the sequence physically lifts; only a fresh sequence starts a gesture again. Two contacts alone never imply recognition: a second finger joining a page scroll on Circle starts no `rotate` ([Euclid's late-join run](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19962152)).

8. **One recognized stream, measured beside the raw one.** `move` phases are coalesced to at most one per animation frame per gesture. Each carries the latest contacts and totals, plus the steps summed since the previous event. `start`, `end`, `cancel`, `tap` and `swipe` are never coalesced or dropped. Raw touch forwarding is unchanged by this record: a raw listener still receives its stream. The DevIndex run reports Main → App messages per contact move in four cases: raw-only, semantic-only, both and neither. Demand-gating the raw forwards would change default traffic for every app, so it is a separate decision after the physical comparison.

9. **Activation stays native.** Recognizers never call `preventDefault` on `touchend` or `click`. `tap` observes a tap; the native `click` stays the activation and fires exactly once. On a drag source, `press` yields to the drag: when the sensor arms the drag, the press ends in `press:cancel`. A press that has reached `press:start` owns the hold, so the recognizer prevents the `contextmenu` that follows for that contact. A node without a `press` subscription keeps the native context menu.

10. **One contact trace, two named providers.** A replay request carries the target, the provider and a bounded list of frames:

    ```js
    {target, provider, frames: [{t, contacts: [{id, x, y, state}]}]}
    ```

    - **Trace fields:** the request names its app session and window. `target` is a component or node id, resolved in that window only. `t` counts ms from the first frame. `x` and `y` are target-relative CSS px. `id` is a stable contact label. `state` is `down`, `move`, `up` or `cancel`.
    - **Frames are snapshots, not deltas.** A frame lists only the contacts that change, each at its absolute position. A contact a frame leaves out keeps its last position.
    - **Sequences and terminals:** a trace may hold several contact sequences, and a sequence ends when no contact is down. The result lists each sequence's terminal (`end`, `cancel` or `none`) in order. The trace-wide `terminal` is the last sequence's.
    - **Presets:** `swipe`, `hold`, `pinch` and `rotate` expand to traces.
    - **Bounds:** limits on frames, duration and contacts are enforced in the schema; the implementing leaf sets them.
    - **Providers:** `engine` and `browser`.
      - `engine`: EventSimulator synthesizes the events in the owning window. It proves recognizer phases and App outcomes. Its events are untrusted, so it cannot prove native scroll, zoom, capture or browser ownership.
      - `browser`: an attached browser-input driver, such as CDP in the Playwright fixture. It proves browser arbitration.
      - A provider that cannot run returns `unavailable` and never falls back to the other.
    - **Result:** `{provider, trusted, observed, phases, sequences, terminal}`.
      - `observed`: the active and changed ids per frame.
      - `phases`: the recognized events, where they are observable.
      - `sequences`: each sequence's terminal, in order.
      - `terminal`: the last sequence's terminal.

      Component and Store state are asserted separately.
    - **Worked example:** the eight-transition trace of the [receipt](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19961766).

      | Frame | Transition | Active | Changed | Sequence |
      |---|---|---|---|---|
      | 0 | A down | A | A | 1 opens |
      | 1 | B down | A, B | B | |
      | 2 | B up | A | B | |
      | 3 | A moves | A | A | |
      | 4 | A cancels | none | A | 1 ends: `cancel` |
      | 5 | C down | C | C | 2 opens |
      | 6 | C moves | C | C | |
      | 7 | C up | none | C | 2 ends: `end` |

      Both providers observe all eight transitions; `engine` reports `trusted: false` and `browser` reports `trusted: true`. The result is `sequences: ['cancel', 'end']`, `terminal: 'end'`.
    - **Surfaces:**
      - Engine: `InteractionService#driveGesture` calls `EventSimulator.driveGesture`. It shares `driveDrag`'s mutex and cancels its open contacts in `finally` on timeout, unmount or window loss.
      - Playwright: the fixture's `nlApp.driveGesture()` supports both providers.
      - Brain: the public `drive_gesture` tool, under the existing write lock. It lands after the Engine call.

## 3. Rejected Options

- **Recognition in App from raw forwards.** Every move must cross to App before anything is decided, and App cannot retroactively prevent a browser cancel. Raw processing in App stays an opt-in for drawing surfaces.
- **One recognizer on the body or on every element.** It costs recognition on every touch with no subscriber.
- **`addDomListener` as the subscription.** It has no removal, so a recognizer holding contacts would outlive its node's listener.
- **Gesture names in `globalDomEvents`.** The body would forward them in every app, and there would be no per-node registration.
- **An uncancelable `touchmove` as the ownership signal.** It also arrives on strokes the browser leaves alone, so it would cancel Helix's horizontal pan.
- **`touch-action: none` on the whole grid.** It stopped every quick stroke in [Ada's Chromium control](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19949561). A grid arm without panning runs only with a monitor that starts JS scrolling at contact.
- **Replay through the Engine only, or through the browser only.** Engine-synthesized input cannot prove browser arbitration. Browser-only replay requires a browser attachment that a peer may not have ([Julia's options](https://github.com/neomjs/neo/discussions/22259#discussioncomment-19934123)).
- **A recognizer library as a dependency.** Hammer's recognizer composition is prior art. Recognition runs in a Main addon and delivers through Neo's event path.

## 4. Migration

1. This record.
2. **The gesture addon:** `register`/`unregister`, decisions 2–9, App's mount branch and release calls, and the `globalDomEvents` test.
3. **Replay:** `driveGesture` in the Engine and the fixture, then Brain's `drive_gesture`.
4. **Consumers:**
   - Gallery: `swipe`.
   - Helix: `pan` and `pinch`. `neo-helix` leaves `TouchDomEvents.mjs:95` in the same commit that declares `pan-y` on `.neo-helix`.
   - Circle: `rotate`.
5. **Default policy:** a passive body listener and a demand-gated sensor listener, only after the physical comparison on iPhone and Android, with an arm without DragDrop.

Adaptive components such as the sheet and the floating action button start on today's primitives and move to these events once step 2 lands.

## 5. Consequences

- **Gained.** One event vocabulary for every consumer. No cost without a subscriber. A replay that names what it proved.
- **Paid.** A Main addon with per-gesture state, a mount branch in App, and while raw forwards stay, an active gesture's frame-rate stream added on top of them.
- **Left out until a reader exists.** Pen pressure, tilt and coalesced samples, which stay raw opt-ins. Inertia, detents, pull-to-refresh and swipe actions, which components compose. Edge-origin gestures, which stay the platform's.
- **Acceptance cases, one per implementing leaf.**
  1. No gesture name is in `globalDomEvents`, and an app without a gesture listener never loads the addon.
  2. Unmounting Helix mid-pinch emits `pinch:cancel` once and then nothing; depth keeps its last committed value.
  3. A second finger joining a browser-owned scroll on Circle starts no `rotate`. This holds in both lift orders, and a fresh sequence afterwards rotates. A horizontal stroke on a `pan-y` Helix, with uncancelable moves and no `pointercancel`, still recognizes `pan`.
  4. Messages per contact move on DevIndex, reported for the four subscriber cases.
  5. A staggered lift and a cancel replay through `engine` (MCP and fixture) and `browser` with the same observed transitions. Without a browser driver, the `browser` provider reports `unavailable`.
  6. A tap on a button inside a `tap`-registered node produces exactly one `click`.
- **Revalidation triggers.** A consumer that needs a family not listed here. A measured move-stream cost that matters on DevIndex. A provider that cannot prove what its row claims. WebKit evidence that contradicts decision 7's ownership signals.
