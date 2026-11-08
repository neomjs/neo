Custom drag&drop implementation.

Deeply inspired by the Shopify implementation:
https://github.com/Shopify/draggable

We cannot use this one for neo.mjs, since our apps => event handlers live inside the App Worker,
and the lib is not using correct import statements (including file name extensions).

## The two drag worlds, and the line between them

Neo ships two drag pipelines because they answer different physics:

- **The synthetic pipeline** (this folder + `main/addon/DragDrop.mjs`) owns the Neo world: worker-side
  handlers, records as payloads, per-frame proxies, FLIP motion, cross-window moves over one shared
  App Worker. It is a pointer-event system — which means it can never deliver a drop into FOREIGN
  content: pointer streams do not enter another browsing context, and there is no `DataTransfer`.
- **Native drag sources** (`main/addon/NativeDragSource.mjs`) own the interop edge: a REAL HTML5 drag
  whose `DataTransfer` is filled from a worker-declared, JSON-only config
  (`Neo.component.Base#nativeDragZone`). That is the only mechanism that reaches an embedded iframe,
  another application, or the OS — because `DataTransfer` exists solely inside a native `dragstart`
  on the main thread, and payload templates over the source node's attributes keep consumer code off
  that thread entirely.

**The partition is a contract with one authority: the registration.** A gesture starting on a
registered native source is native — even under a `neo-draggable` ancestor — because
`sensor/Pointer.mjs` consults the addon's `claimsEvent()` and declines those gestures. Everything else
stays synthetic. Two consequences are load-bearing:

1. A declined gesture never receives the sensor's document-level `dragstart` suppression, so the
   native payload survives.
2. `neo-drag-active` — the hook the iframe shield keys on to make iframes hit-test-inert during
   synthetic drags — is never stamped for a native drag, whose whole purpose may be to LAND on an
   iframe.

Cross-window Neo-to-Neo moves stay synthetic (the shared worker already is one session for every
window); native sources are not a transport between Neo surfaces, they are the border crossing.

## One sensor, two windows

`sensor/Pointer.mjs` hears Pointer Events, so one state machine serves mouse, touch and pen. A
gesture has two windows, and each has its own mechanism:

| Window | Carried by | Why |
|---|---|---|
| press → threshold | `neo-drag-active` and the iframe shield keyed on it (`Global.scss`) | nothing is engaged yet; a press that never becomes a drag must still click its own element |
| `drag:start` → terminal | pointer capture on `document.documentElement` | no click is at stake, and a lost release here would strand an engaged drag |

Capture routes every later event of the pointer to the document, whatever lies under it (an
iframe included), and guarantees that its `pointerup` or `pointercancel` arrives. Both end the
gesture with one `drag:end`; `pointercancel` is a terminal, not an error. A captured event names the
document root, so the sensor adds `eventPath` (the hit-test path the uncaptured event would carry),
which `main/addon/DragDrop.mjs` serializes in place of the event's own. Coordinates stay what the
retired sensors reported: mouse and pen floor the pointer's fractional position to whole pixels, as
their compatibility mouse event does, and touch keeps its precision. The `drag:*` payloads the App
Worker receives stay what they were.

Synthetic input (`main/addon/EventSimulator.mjs`) dispatches the pointer event a real mouse would
fire ahead of each mouse event, with one synthetic `pointerId`. The platform refuses to capture an
id it does not track, so a simulated gesture keeps the document listeners as its transport.

## Touch

The thresholds depend on the pointer: `delay`/`minDistance` for mouse and pen, `touchDelay`/
`touchMinDistance` for touch, where a long press arms the drag and a release before it is a tap.

A touch the browser may pan is a touch it may take away: once it starts scrolling, it fires
`pointercancel`. Engine-owned drag **handles** therefore declare `touch-action: none`: `.neo-splitter`,
`.neo-dashboard-dock-splitter`, `.neo-dock-stack-handle`, the `.neo-resizable` handles and a draggable
dialog header. Whole items that are draggable (list items, tab buttons, sortable headers) keep the
browser's default, so their containers still scroll by touch: a move before `touchDelay` scrolls and
cancels the claim, and once a long press has armed the drag the sensor's non-passive `touchmove`
listener keeps the page from panning. A custom drag handle opts in by declaring `touch-action: none`
itself.
