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
`sensor/Mouse.mjs` consults the addon's `claimsEvent()` and declines those gestures. Everything else
stays synthetic. Two consequences are load-bearing:

1. A declined gesture never receives the sensor's document-level `dragstart` suppression, so the
   native payload survives.
2. `neo-drag-active` — the hook the iframe shield keys on to make iframes hit-test-inert during
   synthetic drags — is never stamped for a native drag, whose whole purpose may be to LAND on an
   iframe.

Cross-window Neo-to-Neo moves stay synthetic (the shared worker already is one session for every
window); native sources are not a transport between Neo surfaces, they are the border crossing.
