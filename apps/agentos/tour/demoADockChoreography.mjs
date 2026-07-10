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
 * The dramatic arc (storyboarded in the reviewed design artifact
 * `apps/agentos/design/dock-choreography-demo.html`):
 *
 * - **S1 — Split choreography:** one editor pane becomes a three-way studio. The arriving
 *   panes enter through real `splitNode` operations; the golden-ratio settles are real
 *   `resizeSplit` commits.
 * - **S2 — Tab dance:** density without loss. The terminal folds into the preview's tab
 *   group, a fourth resident (logs) arrives low, then folds in too — each fold prunes its
 *   emptied node and the layout renormalizes, which IS the story: nothing reloads, the
 *   document just gets denser.
 * - **S3 — Auto-hide wave:** the workspace breathes. The right-column residents tuck to
 *   edge rails one by one until the editor floods the stage, the reveal beat narrates the
 *   click-first contract, then the wave rolls back and the layout remembers itself.
 *
 * The clock inside the editor pane is the object-permanence witness: it keeps ticking
 * through every transition because panes re-parent — they never remount.
 *
 * **Reveal-mode note (a11y contract):** click-reveal is the platform default; hover-reveal
 * is a workspace opt-in. Scene 3's hover moment therefore requires the hosting workspace to
 * set `autoHideRevealOnHover: true` — carried below as the advisory `workspace` block the
 * demo surface applies at mount, and narrated in the scene caption so the tour teaches the
 * opt-in rather than hiding it.
 */

/**
 * The opening stage: one visible editor pane at center, with the three arriving panes
 * present in the cast (`items`) but not yet placed on any node — `splitNode` requires the
 * item to exist and places it itself. Kind values follow the dockZone.v1 item contract.
 * @type {Object}
 */
export const initialDocument = Object.freeze({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        editor  : {componentRef: 'Editor',   title: 'Editor',   kind: 'panel'},
        logs    : {componentRef: 'Logs',     title: 'Logs',     kind: 'panel'},
        preview : {componentRef: 'Preview',  title: 'Preview',  kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: 'editor-tabs'}},
        'editor-tabs': {type: 'tabs', items: ['editor'], activeItemId: 'editor'}
    }
});

/**
 * The Demo-A tour script. Scene/beat structure mirrors the storyboard; operation counts per
 * scene are S1: 4 · S2: 3 · S3: 6 (the storyboard's "auto-hide ×2" beats bind to one
 * executor operation per item — descriptors bind against the live schema, never the mock's
 * shorthand). Pauses are viewer pacing only; replay mode skips the waiting and the logs
 * stay identical.
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
        title  : 'Split choreography — one pane becomes a studio',
        caption: 'An agent is re-docking this workspace, live. The clock keeps ticking: panes re-parent, they never reload.',
        steps  : [
            {
                type      : 'op',
                caption   : 'split(preview → right of editor): the preview enters at 50/50',
                descriptor: {operation: 'splitNode', itemId: 'preview', targetNodeId: 'editor-tabs', orientation: 'horizontal', edge: 'right'},
                expect    : [{path: 'nodes.split-editor-tabs-0.children', equals: ['editor-tabs', 'tabs-preview-0']}]
            },
            {type: 'pause', ms: 900, caption: 'the entering pane grows from its drop edge; siblings yield with the same easing'},
            {
                type      : 'op',
                caption   : 'resizeSplit: the editor takes two thirds — the golden-ratio settle',
                descriptor: {operation: 'resizeSplit', splitNodeId: 'split-editor-tabs-0', sizes: [0.667, 0.333]},
                expect    : [{path: 'nodes.split-editor-tabs-0.sizes.0', equals: 0.667}]
            },
            {
                type      : 'op',
                caption   : 'split(terminal → below editor): the terminal enters low',
                descriptor: {operation: 'splitNode', itemId: 'terminal', targetNodeId: 'editor-tabs', orientation: 'vertical', edge: 'bottom'},
                expect    : [{path: 'nodes.split-editor-tabs-1.children', equals: ['editor-tabs', 'tabs-terminal-0']}]
            },
            {
                type      : 'op',
                caption   : 'resizeSplit: the terminal settles to one third of the column',
                descriptor: {operation: 'resizeSplit', splitNodeId: 'split-editor-tabs-1', sizes: [0.667, 0.333]},
                expect    : [{path: 'nodes.split-editor-tabs-1.sizes.1', equals: 0.333}]
            },
            {
                type   : 'topology-assert',
                caption: 'the three-way studio, committed',
                expect : [
                    {path: 'nodes.root.zones.center',              equals: 'split-editor-tabs-0'},
                    {path: 'nodes.split-editor-tabs-0.children',   equals: ['split-editor-tabs-1', 'tabs-preview-0']},
                    {path: 'nodes.tabs-preview-0.items',           equals: ['preview']}
                ]
            },
            {type: 'pause', ms: 1200, caption: 'scene break — the studio holds'}
        ]
    }, {
        id     : 's2',
        title  : 'Tab dance — density without loss',
        caption: 'Nobody is dragging. The layout gets denser and nothing reloads.',
        steps  : [
            {
                type      : 'op',
                caption   : 'addTab(terminal → the preview group): the tab group forms; the emptied node prunes itself',
                descriptor: {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'tabs-preview-0'},
                expect    : [
                    {path: 'nodes.tabs-preview-0.items',         equals: ['preview', 'terminal']},
                    {path: 'nodes.split-editor-tabs-0.children', equals: ['editor-tabs', 'tabs-preview-0']}
                ]
            },
            {type: 'pause', ms: 900, caption: 'the folding pane shrinks toward its tab slot — the tab IS the pane, relocated'},
            {
                type      : 'op',
                caption   : 'split(logs → below editor): the fourth resident arrives',
                descriptor: {operation: 'splitNode', itemId: 'logs', targetNodeId: 'editor-tabs', orientation: 'vertical', edge: 'bottom'},
                expect    : [{path: 'nodes.split-editor-tabs-1.children', equals: ['editor-tabs', 'tabs-logs-0']}]
            },
            {
                type      : 'op',
                caption   : 'addTab(logs → the group): three tabs, one column — the active tab hands off',
                descriptor: {operation: 'addTab', itemId: 'logs', tabsNodeId: 'tabs-preview-0'},
                expect    : [
                    {path: 'nodes.tabs-preview-0.items',         equals: ['preview', 'terminal', 'logs']},
                    {path: 'nodes.split-editor-tabs-0.children', equals: ['editor-tabs', 'tabs-preview-0']}
                ]
            },
            {type: 'pause', ms: 1200, caption: 'scene break — density without loss, committed'}
        ]
    }, {
        id     : 's3',
        title  : 'Auto-hide wave — the workspace breathes',
        caption: 'Focus mode: the residents tuck to labeled edge rails; the editor floods the stage.',
        steps  : [
            {
                type      : 'op',
                caption   : 'setItemAutoHidden(logs): first tuck — the rail tab appears at the edge',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'logs', autoHidden: true},
                expect    : [{path: 'items.logs.autoHidden', equals: true}]
            },
            {
                type      : 'op',
                caption   : 'setItemAutoHidden(terminal): the wave continues',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true},
                expect    : [{path: 'items.terminal.autoHidden', equals: true}]
            },
            {
                type      : 'op',
                caption   : 'setItemAutoHidden(preview): the editor floods the stage — clock still ticking',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'preview', autoHidden: true},
                expect    : [{path: 'items.preview.autoHidden', equals: true}]
            },
            {
                type   : 'pause',
                ms     : 1600,
                caption: 'the reveal moment: hovering a rail tab slides the pane over as an overlay — shown, never persisted. ' +
                         'Click-reveal is the platform default; this workspace opted into hover (autoHideRevealOnHover).'
            },
            {
                type      : 'op',
                caption   : 'the wave rolls back: preview returns',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'preview', autoHidden: false},
                expect    : [{path: 'items.preview.autoHidden', equals: false}]
            },
            {
                type      : 'op',
                caption   : 'terminal returns',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: false},
                expect    : [{path: 'items.terminal.autoHidden', equals: false}]
            },
            {
                type      : 'op',
                caption   : 'logs returns — a layout remembering itself',
                descriptor: {operation: 'setItemAutoHidden', itemId: 'logs', autoHidden: false},
                expect    : [{path: 'items.logs.autoHidden', equals: false}]
            },
            {
                type   : 'topology-assert',
                caption: 'finale: the dense studio, exactly as the dance left it',
                expect : [
                    {path: 'nodes.tabs-preview-0.items',         equals: ['preview', 'terminal', 'logs']},
                    {path: 'nodes.split-editor-tabs-0.children', equals: ['editor-tabs', 'tabs-preview-0']}
                ]
            }
        ]
    }]
});
