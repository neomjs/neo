/**
 * @summary The Demo-A dock-choreography screenplay: three scenes of `neo.tour.script.v1`
 * content plus the opening stage document — the reviewed single source the demo surface
 * plays, the replay specs execute, and the video takes record.
 *
 * This module is CONTENT, not machinery (the runner is `Neo.ai.client.TourRunner`). It is
 * deliberately data-only: every descriptor binds against the live dockZone.v1 executor
 * vocabulary, every referenced node id is either authored here (the opening document) or
 * derives deterministically from the reducer's seeded id minting (`tabs-<item>-<n>` /
 * `split-<target>-<n>`, counting from 0 and reusing pruned names), so two runs from this
 * opening document produce identical documents and identical operation logs.
 *
 * **Stage topology is architecturally load-bearing:** the adapter rails auto-hidden items
 * from EDGE zones only — center never collapses to a rail (the fail-safe that keeps main
 * content visible). The stage therefore authors the dense column into `root.zones.right`
 * from construction, so scene 3's tucks produce REAL edge rails; the replay spec proves
 * that through the projection boundary, not just the document flags. (The reviewed design
 * mock storyboarded a center-only stage whose rail beat the adapter's fail-safe would
 * suppress — the screenplay adapts the staging, keeps the dramatic arc, and the design
 * artifact picks up the parity note with the visual-identity slice.)
 *
 * The arc:
 *
 * - **S1 — Split choreography:** a working pair (editor at center, preview docked right)
 *   becomes a studio. The terminal enters through a real `splitNode`; the settle is a real
 *   `resizeSplit` commit.
 * - **S2 — Tab dance:** density without loss. The terminal folds into the right-column
 *   group, a fourth resident (logs) arrives low, then folds in too — each fold prunes its
 *   emptied node and the layout renormalizes, which IS the story: no state is lost, the
 *   one committed document just gets denser.
 * - **S3 — Auto-hide wave:** the workspace breathes. The right-column residents tuck into
 *   labeled rail tabs on the right edge one by one until the editor floods the stage, the
 *   reveal beat narrates the click-first contract, then the wave rolls back and the layout
 *   remembers itself.
 *
 * The clock inside the editor pane is the continuity witness: it keeps ticking through
 * every transition — wall-time truth a viewer verifies with their own eyes. (Full
 * instance-level permanence is claimed only once the dashboard side's instance-preserving
 * workspace reconcile lands; under today's coarse re-projection the captions claim
 * document-tier truth and nothing more.)
 *
 * **Reveal-mode note (a11y contract):** click-reveal is the platform default; hover-reveal
 * is a workspace opt-in. Scene 3's hover moment therefore requires the hosting workspace to
 * set `autoHideRevealOnHover: true` — carried below as the advisory `workspace` block the
 * demo surface applies at mount, and narrated in the scene caption so the tour teaches the
 * opt-in rather than hiding it.
 */

/**
 * The opening stage: the editor pane at center, the preview docked in the right edge zone
 * (edge residency by construction — see the module summary), with the two arriving panes
 * present in the cast (`items`) but not yet placed — `splitNode` requires the item to
 * exist and places it itself. Kind values follow the dockZone.v1 item contract.
 * @type {Object}
 */
export const initialDocument = Object.freeze({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        editor  : {componentRef: 'Editor',   title: 'Editor',   kind: 'panel'},
        logs    : {componentRef: 'Logs',     title: 'Logs',     kind: 'panel'},
        preview : {componentRef: 'Preview',  title: 'Preview',  kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: 'editor-tabs', right: 'side-tabs'}},
        'editor-tabs': {type: 'tabs', items: ['editor'],  activeItemId: 'editor'},
        'side-tabs'  : {type: 'tabs', items: ['preview'], activeItemId: 'preview'}
    }
});

/**
 * The Demo-A tour script. Scene/beat structure follows the storyboard's dramatic arc on
 * the edge-zone-corrected stage; operation counts per scene are S1: 2 · S2: 3 · S3: 6
 * (the storyboard's "auto-hide ×2" beats bind to one executor operation per item —
 * descriptors bind against the live schema, never the mock's shorthand). Pauses are viewer
 * pacing only; replay mode skips the waiting and the logs stay identical.
 * @type {Object}
 */
export const demoATourScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'demo-a-dock-choreography',
    title : 'Layouts that rebuild themselves',

    // advisory for the hosting surface (applied at mount, outside the op stream):
    // scene 3's hover moment rides the a11y-gated workspace opt-in.
    workspace: {autoHideRevealOnHover: true},

    scenes: [{
        id     : 's1',
        title  : 'Split choreography — the studio assembles',
        caption: 'An agent is re-docking this workspace, live. The clock keeps ticking: the layout is one committed document — nothing is lost.',
        steps  : [
            {
                type      : 'op',
                caption   : 'split(terminal → below editor): the terminal enters low',
                descriptor: {operation: 'splitNode', itemId: 'terminal', targetNodeId: 'editor-tabs', orientation: 'vertical', edge: 'bottom'},
                expect    : [{path: 'nodes.split-editor-tabs-0.children', equals: ['editor-tabs', 'tabs-terminal-0']}]
            },
            {type: 'pause', ms: 900, caption: 'the entering pane grows from its drop edge; siblings yield with the same easing'},
            {
                type      : 'op',
                caption   : 'resizeSplit: the terminal settles to one third — the golden-ratio settle',
                descriptor: {operation: 'resizeSplit', splitNodeId: 'split-editor-tabs-0', sizes: [0.667, 0.333]},
                expect    : [{path: 'nodes.split-editor-tabs-0.sizes.1', equals: 0.333}]
            },
            {
                type   : 'topology-assert',
                caption: 'the studio, committed: editor column at center, preview docked right',
                expect : [
                    {path: 'nodes.root.zones.center', equals: 'split-editor-tabs-0'},
                    {path: 'nodes.root.zones.right',  equals: 'side-tabs'},
                    {path: 'nodes.side-tabs.items',   equals: ['preview']}
                ]
            },
            {type: 'pause', ms: 1200, caption: 'scene break — the studio holds'}
        ]
    }, {
        id     : 's2',
        title  : 'Tab dance — density without loss',
        caption: 'Nobody is dragging. The layout gets denser and no state is lost — it is all one committed document.',
        steps  : [
            {
                type      : 'op',
                caption   : 'addTab(terminal → the right group): the tab group forms; the emptied node prunes itself',
                descriptor: {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'side-tabs'},
                expect    : [
                    {path: 'nodes.side-tabs.items',   equals: ['preview', 'terminal']},
                    {path: 'nodes.root.zones.center', equals: 'editor-tabs'}
                ]
            },
            {type: 'pause', ms: 900, caption: 'the folding pane shrinks toward its tab slot — the tab IS the pane, relocated'},
            {
                type      : 'op',
                caption   : 'split(logs → below editor): the fourth resident arrives',
                descriptor: {operation: 'splitNode', itemId: 'logs', targetNodeId: 'editor-tabs', orientation: 'vertical', edge: 'bottom'},
                expect    : [{path: 'nodes.split-editor-tabs-0.children', equals: ['editor-tabs', 'tabs-logs-0']}]
            },
            {
                type      : 'op',
                caption   : 'addTab(logs → the group): three tabs, one column — the active tab hands off',
                descriptor: {operation: 'addTab', itemId: 'logs', tabsNodeId: 'side-tabs'},
                expect    : [
                    {path: 'nodes.side-tabs.items',   equals: ['preview', 'terminal', 'logs']},
                    {path: 'nodes.root.zones.center', equals: 'editor-tabs'}
                ]
            },
            {type: 'pause', ms: 1200, caption: 'scene break — density without loss, committed'}
        ]
    }, {
        id     : 's3',
        title  : 'Auto-hide wave — the workspace breathes',
        caption: 'Focus mode: the residents tuck into labeled rail tabs on the right edge; the editor floods the stage.',
        steps  : [
            {
                type      : 'op',
                caption   : 'setItemAutoHidden(preview): first tuck — a labeled rail tab appears on the right edge',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'preview', autoHidden: true},
                expect    : [{path: 'items.preview.autoHidden', equals: true}]
            },
            {
                type      : 'op',
                caption   : 'setItemAutoHidden(terminal): the wave continues down the rail',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true},
                expect    : [{path: 'items.terminal.autoHidden', equals: true}]
            },
            {
                type      : 'op',
                caption   : 'setItemAutoHidden(logs): the editor floods the stage — clock still ticking',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'logs', autoHidden: true},
                expect    : [{path: 'items.logs.autoHidden', equals: true}]
            },
            {
                type: 'pause',
                ms  : 1600,
                // the surface cue makes the narrated beat EXECUTABLE: the workspace feeds the
                // rail's reveal machine at this beat — a real transient reveal, runtime-only,
                // never persisted (the following commit's re-projection releases it)
                cue    : {type: 'reveal', itemId: 'preview'},
                caption: 'the reveal moment: a rail tab reveals its pane as a transient overlay — shown, never persisted. ' +
                         'Click-reveal is the platform default; this workspace also opted into hover (autoHideRevealOnHover).'
            },
            {
                type      : 'op',
                caption   : 'the wave rolls back: logs returns',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'logs', autoHidden: false},
                expect    : [{path: 'items.logs.autoHidden', equals: false}]
            },
            {
                type      : 'op',
                caption   : 'terminal returns',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: false},
                expect    : [{path: 'items.terminal.autoHidden', equals: false}]
            },
            {
                type      : 'op',
                caption   : 'preview returns — a layout remembering itself',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'preview', autoHidden: false},
                expect    : [{path: 'items.preview.autoHidden', equals: false}]
            },
            {
                type   : 'topology-assert',
                caption: 'finale: the dense studio, exactly as the dance left it',
                expect : [
                    {path: 'nodes.side-tabs.items',    equals: ['preview', 'terminal', 'logs']},
                    {path: 'nodes.root.zones.center',  equals: 'editor-tabs'},
                    {path: 'items.preview.autoHidden', equals: false}
                ]
            }
        ]
    }]
});
