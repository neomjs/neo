import cockpitDockDocument from '../util/cockpitDockDocument.mjs';

/**
 * @summary The flagship fusion screenplay: cockpit → docked panel → OS window → share — the
 * v13.2 cornerstone done-signal as `neo.tour.script.v1` data, played on the REAL Fleet Cockpit.
 *
 * Four beats, one continuous tour (the product story a stranger can retell):
 *
 * 1. **Cockpit** — the live mission-control surface: the density-ranked fleet roster over the
 *    ticking activity stream. The opening shape is captured live as a named perspective (the
 *    Demo-B capture pattern — no pre-baked records).
 * 2. **Docked panel** — the agent detail leaves the auto-hidden rail and takes a real split
 *    beside the fleet: two semantic operations through the same `execute_dock_operation` path
 *    a live agent uses.
 * 3. **OS window** — `detachItem`: the detail pane leaves the browser window for its own OS
 *    window ON THE SAME SharedWorker heap. The catalog keeps the record (vessel ownership),
 *    the instance is reparented — never recreated — and the stream keeps ticking. Return is a
 *    host-owned `reattach` cue (the Demo-B pop-in pattern).
 * 4. **Share** — the workspace becomes a copyable artifact: save → export → morph away →
 *    import → restore. "Share" v1 is the perspective-JSON round-trip; no backend.
 *
 * Layering contract (the Demo-B lesson): every `expect`/`topology-assert` in this script is
 * cue-independent document-truth — it holds in pure spec-mode replay where host cues are
 * pacing no-ops. Worker-truth (instance-id continuity, stream-tick monotonicity, export/import
 * fingerprint equality) belongs to the e2e leaf, which plays THIS script in live mode and
 * asserts through the Neural Link.
 *
 * Cue vocabulary consumed by the hosting cockpit (Leaf-2 wiring): `perspective-save`,
 * `perspective-load` (Demo-B precedent) · `perspective-export`, `perspective-import` (the
 * share round-trip — export serializes the named record to a JSON artifact, import admits
 * one back through validation) · `popout`, `reattach` (the detail vessel's OWN state machine —
 * the host's full pop-out flow, never a bare document op, so the OS window actually opens).
 */

/**
 * The opening stage — the Fleet Cockpit's REAL default document (SSOT §01), imported from the
 * cockpit's own data leaf so the tour can never drift from the shipped surface.
 * @type {Object}
 */
export const initialDocument = Object.freeze(cockpitDockDocument());

/**
 * The fusion tour script. Document mutations are executable `op` steps with expects; every
 * perspective/window transition the HOST owns rides a cue on a pacing step.
 * @type {Object}
 */
export const fusionTourScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'fusion-flagship',
    title : 'One workspace: cockpit, dock, OS window, share',

    workspace: {},

    scenes: [{
        id     : 's1',
        title  : 'Cockpit — the fleet, live',
        caption: 'Mission control: the agent roster ranked by activity, the event stream ticking underneath. Everything on this stage is one running app-worker.',
        steps  : [
            {type: 'pause', ms: 1400, caption: 'the stream is LIVE — every chip is a real fleet event, and it will not stop while the workspace changes'},
            {type: 'pause', ms: 700, cue: {type: 'perspective-save', name: 'Mission Control'}, caption: 'save("Mission Control"): the opening stage becomes a named perspective — captured state, not a screenshot'}
        ]
    }, {
        id     : 's2',
        title  : 'Docked panel — the detail joins the workspace',
        caption: 'The agent detail lives on the auto-hidden rail. Two semantic operations dock it beside the fleet — the same operation path a live agent drives.',
        steps  : [
            {
                type      : 'op',
                caption   : 'reveal(detail): off the rail, into the layout truth',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'detail', autoHidden: false},
                expect    : [{path: 'items.detail.autoHidden', equals: false}]
            },
            {
                type      : 'op',
                caption   : 'split(detail → beside fleet): a real split, animated by the FLIP layer',
                descriptor: {operation: 'splitNode', itemId: 'detail', targetNodeId: 'fleet-tabs', orientation: 'horizontal', edge: 'right', sizes: [0.62, 0.38]},
                expect    : [{path: 'nodes.split-fleet-tabs-0.orientation', equals: 'horizontal'}]
            },
            {type: 'pause', ms: 1200}
        ]
    }, {
        id     : 's3',
        title  : 'OS window — the pane leaves, the state does not blink',
        caption: 'detachItem: the detail becomes a real OS window on the SAME SharedWorker heap. Reparent, never recreate — the stream underneath keeps ticking through the hop.',
        steps  : [
            {type: 'pause', ms: 900, cue: {type: 'popout', itemId: 'detail'}, caption: 'pop out(detail): the host vessel flow runs — detachItem commits, the catalog record becomes the vessel ownership, a REAL OS window opens'},
            {type: 'pause', ms: 2200, caption: 'two OS windows, one heap: the SAME component instance, the SAME live subscriptions — none of the docking libraries surveyed in ADR-0029 §4 offered this'},
            {type: 'pause', ms: 900, cue: {type: 'reattach', itemId: 'detail'}, caption: 'reattach(detail): home again — same instance, same state, zero re-mount'},
            {type: 'pause', ms: 1800}
        ]
    }, {
        id     : 's4',
        title  : 'Share — the exact workspace, as an artifact',
        caption: 'A workspace you can hand to a teammate: save it, export the JSON, prove the round-trip by morphing away and importing it back.',
        steps  : [
            {type: 'pause', ms: 700, cue: {type: 'perspective-save', name: 'Shared Session'}, caption: 'save("Shared Session"): the current shape, named'},
            {type: 'pause', ms: 700, cue: {type: 'perspective-export', name: 'Shared Session'}, caption: 'export("Shared Session"): the whole layout as one JSON artifact, readable over the Neural Link — no backend'},
            {type: 'pause', ms: 1100, cue: {type: 'perspective-load', name: 'Mission Control'}, caption: 'load("Mission Control"): morph away — the shared shape is gone from the stage'},
            {type: 'pause', ms: 1100, cue: {type: 'perspective-import', name: 'Shared Session'}, caption: 'import(artifact): the JSON comes back through validation, exactly as exported'},
            {type: 'pause', ms: 1100, cue: {type: 'perspective-load', name: 'Shared Session'}, caption: 'load("Shared Session"): the exported artifact restores fingerprint-equal — the transfer rides the Neural Link read; cross-cockpit hand-off builds on this boundary'},
            {
                type   : 'topology-assert',
                caption: 'the catalog truth that holds in every mode: the detail is a first-class workspace citizen, the fleet never left',
                expect : [
                    {path: 'items.detail.title', equals: 'Agent detail'},
                    {path: 'items.fleet.title',  equals: 'Fleet'}
                ]
            },
            {type: 'pause', ms: 900}
        ]
    }]
});

export default fusionTourScript;
