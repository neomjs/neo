/**
 * @summary Workstation's flagship-film screenplay v2 — the `neo.tour.script.v1` narrative
 * authority for the 90–150s recorded journey, with narration captions as the spoken-text draft,
 * and the RUNNABLE screenplay the Workstation's own "Start film tour" plays.
 *
 * Authority chain, stated so no consumer confuses the layers:
 * - `test/playwright/e2e/workstation/WorkstationFiveBeatNL.spec.mjs` is the WITNESS authority
 *   for the gestures themselves — a take that cannot pass the spec is not a take.
 * - THIS file is the NARRATIVE authority: show-order, pacing budget, the narration draft each
 *   beat speaks over the witnessed gesture — and the executable steps that drive it. One script,
 *   three consumers: the viewer's in-app tour, the whitebox replay, and the recorded take.
 * - The recorded transcript derives from the captured cut, never the reverse: these captions
 *   are the working screenplay, and the final voice track re-times to the footage.
 *
 * How the window scenes run from a button: a vessel birth is `Neo.Main.windowOpen`, which the
 * browser permits only inside a user gesture. The screenplay therefore places a `gate` cue before
 * every beat that opens a window: the viewer's click on **Continue** is the activation the birth
 * needs, and the tour's host settlement holds the next beat until that click. Replay and take
 * modes resolve gates without a viewer (`autoGates`), because Playwright's real pointer carries
 * its own activation. The dense tour (`denseWorkstation.mjs`) stays the no-window fallback.
 *
 * Pacing: `targetSeconds` per scene is a budget, not a stopwatch — captured gestures own their
 * real duration and the cut re-paces around them. The scenes sum to exactly 106s inside the
 * 90–150s envelope: the `minSeconds` floor no longer binds scene-for-scene — 16s of slack sit
 * above it — so a budget edit trades seconds within the 106s sum or cuts toward the floor, and
 * captured gesture durations plus the edit-layer cut-in re-pace upward from there.
 *
 * Claim discipline (revalidated against the current witnesses at authoring time):
 * - same-instance continuity   → `getPaneIdentity` equality asserts (scenes 3, 6, 8)
 * - mid-gesture window birth   → `proof.born` before pointer-up (scene 3)
 * - exactly-one-claim          → `claimCount: 1` + single rendered preview (scene 5)
 * - atomic return + self-close → `phaseOrder` `documents-adopted → … → topology-exited` (scene 6)
 * - living-content continuity  → the Feed store's monotonic `sequence`, never reset (scenes 1, 8)
 * - preview determinism        → two-take beat-log equality + painted-dwell rect witnesses (scene 2)
 * - perspective restore        → store-backed capture/restore with exact-baseline document
 *                                fidelity, fail-closed on unknown names (scene 7)
 * - undo/redo round-trip       → one dock mutation walked back and replayed on the Group cursor (scene 7)
 * Narration makes NO cross-platform, default-selection, or portability claims, and carries no
 * competitive comparisons — captions inherit the spec's macOS-headed claim boundary.
 *
 * Format decision (recorded): the v2 baseline is a SINGLE NARRATOR — the journey is one
 * continuous gesture story, and the engine-truth layer (worker receipts) rides as on-screen
 * caption overlays rather than a second voice. The dialogue variant (narrator = what you see,
 * engine voice = what the worker knows) stays the named alternative; operator ears decide at
 * the voice audition, and flipping requires only re-mapping `narration` lines to speakers.
 *
 * The N-window density beat (Fleet cockpit, three windows, live mailbox migration) is an
 * EDIT-LAYER cut-in sourced from its own witness spec — it is not part of this tour's runtime
 * and deliberately absent from the scene list below.
 */

/**
 * The film-paced gesture options every real-pointer cue shares: a bowed path sampled at ~30 fps
 * with the synthetic cursor visible, and a birth gate wide enough for a vsync-limited boot.
 * Data only — the executors read these as plain options.
 * @type {Object}
 */
const filmPace = Object.freeze({birthAttempts: 240, curve: 0.18, moveDelay: 33, moveSteps: 24, showCursor: true});

/**
 * The surface-cue vocabulary the screenplay uses. `TourController#executeCue` must handle every
 * entry; the unit spec asserts the two lists agree so a renamed cue cannot ship as a silent no-op.
 * @type {ReadonlyArray<String>}
 */
export const filmCueTypes = Object.freeze([
    'scroll', 'canvas-update', 'cross-zone-showcase', 'gate', 'tear-out', 'convert-while-dragging',
    'stack-return', 'perspective-capture', 'perspective-restore', 'undo', 'redo'
]);

/**
 * The flagship-film screenplay. Scene ids are stable anchors for the cut, the caption
 * renderer, and the take QA checklist. Every scene carries runnable `steps`; `narration` is the
 * spoken draft and `beats` name what each step shows.
 * @type {Object}
 */
export const fiveBeatFilmScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'workstation-flagship-film-v2',
    title : 'The content never stops living',

    envelope : {maxSeconds: 150, minSeconds: 90},
    workspace: {height: 1440, width: 2560},

    scenes: [{
        id           : 'film-cold-open',
        title        : 'The room is alive',
        targetSeconds: 12,
        narration    : 'This is a living workspace. Twenty panes — a hundred-thousand-row grid, streaming feeds, live telemetry. Watch the split: the room answers, and nothing stops moving.',
        beats        : ['dense opening topology', 'resizeSplit through the real boundary', 'the hundred-thousand-row matrix crosses its midpoint', 'feed heartbeat visibly advancing'],
        steps        : [{
            type   : 'topology-assert',
            caption: 'all twenty panes are live; the heavy group deliberately overflows',
            expect : [
                {path: 'nodes.scale-tabs.items', equals: ['scale']},
                {path: 'nodes.heavy-tabs.items.0', equals: 'alerts'},
                {path: 'nodes.heavy-tabs.items.11', equals: 'files'},
                {path: 'items.graph.autoHidden', equals: true},
                {path: 'items.inspector.autoHidden', equals: true}
            ]
        }, {
            type      : 'op',
            caption   : 'resizeSplit(split-main → 52/48): the real boundary yields and the document keeps the proportion',
            descriptor: {operation: 'resizeSplit', splitNodeId: 'split-main', sizes: [0.52, 0.48]},
            expect    : [
                {path: 'nodes.split-main.sizes.0', equals: 0.52},
                {path: 'nodes.split-main.sizes.1', equals: 0.48}
            ]
        }, {
            type   : 'pause',
            ms     : 1400,
            cue    : {type: 'scroll', index: 50000},
            caption: 'a hundred thousand rows cross their midpoint — and the rest of the room keeps breathing'
        }, {
            type   : 'pause',
            ms     : 1200,
            cue    : {type: 'canvas-update'},
            caption: 'the feed heartbeat advances; a visible sparkline repaints in the Canvas Worker'
        }]
    }, {
        id           : 'film-showcase',
        title        : 'Every target answers the pointer',
        targetSeconds: 14,
        narration    : 'Drag one tab. Every target answers — an edge preview here, a merge preview there. Release commits exactly what you saw. Escape cancels, and the document is untouched.',
        beats        : ['cross-zone drag with two dwells', 'edge-bottom preview hugs its zone', 'tab-into preview fills its target', 'commit equals the active preview'],
        steps        : [{
            // Commits joins Metrics and Audit in `right-top-tabs`. That group is the stored home
            // the later window beats return to: the tear-out must leave it populated (a tabs node
            // emptied by its last pane is removed, and the stack return then aims at whichever
            // tabs node comes first — measured on 2026-09-23 as the return that never settled).
            type: 'pause',
            ms  : 1600,
            cue : {
                type        : 'cross-zone-showcase',
                itemId      : 'commits',
                sourceNodeId: 'right-bottom-tabs',
                terminal    : 'commit',
                dwells      : [{
                    targetNodeId : 'scale-tabs',
                    placementKind: 'edge-bottom'
                }, {
                    targetNodeId : 'right-top-tabs',
                    placementKind: 'tab-into'
                }],
                options: {
                    dwellDelay: 700,
                    moveDelay : 24,
                    moveSteps : 18,
                    showCursor: true
                }
            },
            caption: 'Commits crosses the matrix split preview, then joins Metrics through the live center target'
        }]
    }, {
        id           : 'film-morph',
        title        : 'Change your mind — nothing happened',
        targetSeconds: 10,
        narration    : 'Drag past the window’s edge — a real window is born mid-gesture. Changed your mind? Come back. The window retires itself before you release. Zero mutation — the workspace never even blinked. Same pane, one more time: this time it stays.',
        beats        : ['the viewer opens the door: one click is the browser’s permission', 'boundary exit births the vessel before pointer-up', 're-entry while dragging retires the vessel', 'document byte-identical by guard'],
        steps        : [{
            type   : 'pause',
            ms     : 0,
            cue    : {type: 'gate', prompt: 'Continue — Metrics leaves and comes back before the pointer lifts'},
            caption: 'A pane is about to leave the window and return before you let go. Your click is the browser’s permission to open the window.'
        }, {
            // The re-entry pane is the group's ACTIVE tab, the one a narrow tab bar always renders:
            // a tab folded into an overflow menu is no drag handle (Audit, third in the 14 %-wide
            // right group, and Traces in the twelve-tab heavy group both refused to arm on
            // 2026-09-23), and the five-beat witness proves the morph on Metrics exactly like this.
            type   : 'pause',
            ms     : 1000,
            cue    : {type: 'tear-out', itemId: 'metrics', sourceNodeId: 'right-top-tabs', options: {...filmPace, reenter: true}},
            caption: 're-entry while dragging retires the vessel; the in-window proxy resumes'
        }, {
            type   : 'topology-assert',
            caption: 'document byte-identical: Metrics is still catalogued where it was',
            expect : [{path: 'items.metrics.title', equals: 'System Metrics'}]
        }]
    }, {
        id           : 'film-tear-out',
        title        : 'A window is born mid-gesture',
        targetSeconds: 14,
        narration    : 'Now let it go. A real window is born — mid-gesture, while the pointer is still down — and this time it stays. The pane inside it is the same live instance. The grid never reloaded. The feed never paused.',
        beats        : ['the viewer opens the door again', 'boundary exit births the vessel before pointer-up', 'pane identity preserved across the window boundary', 'living content uninterrupted'],
        steps        : [{
            type   : 'pause',
            ms     : 0,
            cue    : {type: 'gate', prompt: 'Continue — then watch Metrics leave the window'},
            caption: 'A real window is about to be born mid-gesture and stay. Your click is the browser’s permission to open it.'
        }, {
            type   : 'pause',
            ms     : 1200,
            cue    : {type: 'tear-out', itemId: 'metrics', sourceNodeId: 'right-top-tabs', options: filmPace},
            caption: 'boundary exit births the vessel before pointer-up; the same live pane rides along'
        }]
    }, {
        id           : 'film-second-window',
        title        : 'The second window learns to dock',
        targetSeconds: 16,
        narration    : 'A second pane converts to a window while you drag it — and docks into the first. Dock zones glow inside a real OS window. Two windows overlap; exactly one claims the pointer. One application. One shared heap.',
        beats        : ['the viewer opens the door for the second window', 'convert-while-dragging', 'dock zones render inside the target popup', 'overlap arbitration: exactly one claim', 'A+B compose in the vessel'],
        steps        : [{
            type   : 'pause',
            ms     : 0,
            cue    : {type: 'gate', prompt: 'Continue — Commits becomes a window and docks into Metrics'},
            caption: 'A second pane is about to become a window while it is dragged, and dock into the first one.'
        }, {
            type: 'pause',
            ms  : 1400,
            cue : {
                type        : 'convert-while-dragging',
                itemId      : 'commits',
                sourceNodeId: 'right-top-tabs',
                targetItemId: 'metrics',
                options     : {attempts: 240, dwellDelay: 700, moveDelay: 33, moveSteps: 24, showCursor: true}
            },
            caption: 'dock zones glow inside a real OS window; exactly one target claims the pointer; A and B compose in the vessel'
        }]
    }, {
        id           : 'film-reintegration',
        title        : 'The stack comes home as one',
        targetSeconds: 14,
        narration    : 'Drag the merged stack home — as one. The commit is atomic. And the emptied window closes itself — after the document lands, never before.',
        beats        : ['whole-stack grip', 'stored-home acquisition', 'atomic transferNode commit', 'vessel self-close strictly after adoption'],
        steps        : [{
            // No synthetic cursor on this beat: the return's cursor rides from the vessel into the
            // main window, and with it the executor did not settle in three tour runs on 2026-09-23
            // while the same return settled without it — the cursor is the camera's, not the tour's.
            type   : 'pause',
            ms     : 1200,
            cue    : {type: 'stack-return', ownerItemId: 'metrics', options: {attempts: 240, moveDelay: 33, showCursor: false}},
            caption: 'the whole stack rides one grip home; the emptied vessel closes itself after the document lands'
        }, {
            type   : 'topology-assert',
            caption: 'both panes are back in the main catalog with their identities intact',
            expect : [
                {path: 'items.metrics.title', equals: 'System Metrics'},
                {path: 'items.commits.title', equals: 'Commit Stream'}
            ]
        }]
    }, {
        id           : 'film-perspectives-undo',
        title        : 'Arrangements are data; operations are transactions',
        targetSeconds: 16,
        narration    : 'Save this arrangement as a perspective. Tear the room apart — one click restores it, same instances, same living content. And every dock operation is a transaction: undo walks it back. Redo replays it.',
        beats        : ['capture perspective', 'disruptive rearrangement', 'restore: topology returns, instances persist', 'undo/redo round-trip on a dock mutation'],
        steps        : [{
            type   : 'pause',
            ms     : 600,
            cue    : {type: 'perspective-capture', name: 'film-baseline', title: 'Film baseline'},
            caption: 'the arrangement is captured as a perspective — data, not a screenshot'
        }, {
            type      : 'op',
            caption   : 'tear the room apart: Security becomes its own split below the matrix',
            descriptor: {operation: 'splitNode', itemId: 'security', targetNodeId: 'scale-tabs', orientation: 'vertical', edge: 'bottom', sizes: [0.72, 0.28]},
            expect    : [{path: 'nodes.split-scale-tabs-0.children', equals: ['scale-tabs', 'tabs-security-0']}]
        }, {
            // Cue effects are witnessed through their receipts (each carries the tabs membership
            // it produced), never through a following `topology-assert`: the document-tier replay
            // in `spec` mode executes no cues, and the screenplay must run there unchanged.
            type   : 'pause',
            ms     : 900,
            cue    : {type: 'perspective-restore', name: 'film-baseline'},
            caption: 'one restore: the topology returns, the instances never moved'
        }, {
            type      : 'op',
            caption   : 'one dock mutation: Security joins the matrix group',
            descriptor: {operation: 'addTab', itemId: 'security', tabsNodeId: 'scale-tabs'},
            expect    : [{path: 'nodes.scale-tabs.activeItemId', equals: 'security'}]
        }, {
            type   : 'pause',
            ms     : 900,
            cue    : {type: 'undo'},
            caption: 'undo walks the transaction back — the heavy group holds Security again'
        }, {
            type   : 'pause',
            ms     : 900,
            cue    : {type: 'redo'},
            caption: 'redo replays it — Security is in the matrix group once more'
        }]
    }, {
        id           : 'film-signature',
        title        : 'It never left',
        targetSeconds: 10,
        narration    : 'Same instances, end to end. Heartbeats monotonic through every transition. The content never stopped living — because it never left.',
        beats        : ['final topology readout', 'identity equality end-to-end', 'monotonic heartbeat close'],
        steps        : [{
            type   : 'topology-assert',
            caption: 'final readout: the split proportion, every travelled pane, all still here',
            expect : [
                {path: 'nodes.split-main.sizes', equals: [0.52, 0.48]},
                {path: 'items.metrics.title', equals: 'System Metrics'},
                {path: 'items.commits.title', equals: 'Commit Stream'},
                {path: 'items.traces.title', equals: 'Distributed Trace Explorer'}
            ]
        }, {
            type   : 'pause',
            ms     : 1500,
            caption: 'heartbeats monotonic through every transition — the content never left'
        }]
    }]
});
