/**
 * @summary Demo-B screenplay: named perspectives morphing + the shared-heap pop-out — the
 * only-Neo showcase (`neo.tour.script.v1` data, consumed by the Demo-B workspace's runner).
 *
 * Dramatic arc (the differentiator story single-process docking libraries cannot tell):
 *
 * 1. **Capture** — the agent BUILDS three named perspectives live, saving each through the
 *    real perspective store (no pre-baked records: S1's saves are the §2.2 capture path).
 * 2. **Morph** — loading the perspectives back re-projects the committed document and the
 *    FLIP layer glides every surviving pane to its new geometry; the counter keeps counting.
 * 3. **Pop-out** — the workbench pane detaches to a real OS window on the SAME SharedWorker
 *    heap and reattaches, its instance-bound counter unbroken: reparent, never recreate.
 * 4. **Changed topology** — the detached two-workspace record restores into a one-window
 *    world through the real reconciler. Its no-live-workspace remainder is rendered, and no
 *    popup is auto-spawned.
 *
 * Perspective saves/loads and reattach ride surface CUES (the Demo-A reveal-cue pattern).
 * The actual two-window move is different: one semantic `cross-window` runner step awaits the
 * host-owned real pointer gesture and its structured continuity receipt. Document mutations
 * stay `op` steps with expects; every executable step remains deterministic in the replay log.
 */

/**
 * The opening stage — also captured live as the "Focus" perspective in scene 1.
 * @type {Object}
 */
export const initialDocument = Object.freeze({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        workbench: {componentRef: 'Workbench', title: 'Workbench', kind: 'panel'},
        inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel'},
        timeline : {componentRef: 'Timeline',  title: 'Timeline',  kind: 'panel'},
        console  : {componentRef: 'Console',   title: 'Console',   kind: 'terminal'}
    },
    nodes: {
        root            : {type: 'edge-zone', zones: {center: {nodeId: 'workbench-tabs'}, right: {nodeId: 'side-tabs'}}},
        'workbench-tabs': {type: 'tabs', items: ['workbench'], activeItemId: 'workbench'},
        'side-tabs'     : {type: 'tabs', items: ['inspector', 'timeline', 'console'], activeItemId: 'inspector'}
    }
});

/**
 * The Demo-B tour script. Perspective/reattach beats are cues; the cross-window move and
 * document mutations are executable steps. Pauses are viewer pacing only.
 * @type {Object}
 */
export const demoBTourScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'demo-b-perspectives-popout',
    title : 'Perspectives that morph, panes that leave the window',

    workspace: {},

    scenes: [{
        id     : 's1',
        title  : 'Capture — three perspectives, saved live',
        caption: 'The agent shapes the workspace and NAMES each shape. Every save goes through the perspective store — captured state, not screenshots.',
        steps  : [
            {type: 'pause', ms: 600, cue: {type: 'perspective-save', name: 'Focus'}, caption: 'save("Focus"): the opening stage becomes a named perspective'},
            {type: 'pause', ms: 700},
            {
                type      : 'op',
                caption   : 'split(timeline → below workbench): the review shape begins',
                descriptor: {operation: 'splitNode', itemId: 'timeline', targetNodeId: 'workbench-tabs', orientation: 'vertical', edge: 'bottom', sizes: [0.65, 0.35]},
                expect    : [{path: 'nodes.split-workbench-tabs-0.orientation', equals: 'vertical'}]
            },
            {
                type      : 'op',
                caption   : 'split(console → below inspector): logs live right-low',
                descriptor: {operation: 'splitNode', itemId: 'console', targetNodeId: 'side-tabs', orientation: 'vertical', edge: 'bottom', sizes: [0.6, 0.4]},
                expect    : [{path: 'nodes.split-side-tabs-0.orientation', equals: 'vertical'}]
            },
            {type: 'pause', ms: 600, cue: {type: 'perspective-save', name: 'Review'}, caption: 'save("Review"): the four-quadrant working shape, named'},
            {type: 'pause', ms: 700},
            {
                type      : 'op',
                caption   : 'merge(everything → workbench): one stage for the audience',
                descriptor: {operation: 'moveItem', itemId: 'inspector', targetNodeId: 'workbench-tabs'},
                expect    : [{path: 'nodes.workbench-tabs.items', equals: ['workbench', 'inspector']}]
            },
            {
                type      : 'op',
                caption   : 'merge(timeline → workbench)',
                descriptor: {operation: 'moveItem', itemId: 'timeline', targetNodeId: 'workbench-tabs'},
                expect    : [{path: 'nodes.workbench-tabs.items', equals: ['workbench', 'inspector', 'timeline']}]
            },
            {
                type      : 'op',
                caption   : 'merge(console → workbench): tabs behind the star',
                descriptor: {operation: 'moveItem', itemId: 'console', targetNodeId: 'workbench-tabs'},
                expect    : [{path: 'nodes.workbench-tabs.items', equals: ['workbench', 'inspector', 'timeline', 'console']}]
            },
            {
                type      : 'op',
                caption   : 'the workbench takes the stage',
                descriptor: {operation: 'addTab', itemId: 'workbench', tabsNodeId: 'workbench-tabs'},
                expect    : [{path: 'nodes.workbench-tabs.activeItemId', equals: 'workbench'}]
            },
            {type: 'pause', ms: 600, cue: {type: 'perspective-save', name: 'Presentation'}, caption: 'save("Presentation"): full-bleed, one pane, all attention'}
        ]
    }, {
        id     : 's2',
        title  : 'Morph — load a name, watch the layout glide',
        caption: 'Loading a perspective is one committed document swap; the FLIP layer glides every surviving pane into its new geometry. The counter never blinks.',
        steps  : [
            {type: 'pause', ms: 900, cue: {type: 'perspective-load', name: 'Focus'}, caption: 'load("Focus"): back to the opening shape — animated, not repainted'},
            {type: 'pause', ms: 1200},
            {type: 'pause', ms: 900, cue: {type: 'perspective-load', name: 'Review'}, caption: 'load("Review"): the quadrants return'},
            {type: 'pause', ms: 1200},
            {type: 'pause', ms: 900, cue: {type: 'perspective-load', name: 'Presentation'}, caption: 'load("Presentation"): and collapse to the stage'},
            {type: 'pause', ms: 1200}
        ]
    }, {
        id     : 's3',
        title  : 'Pop-out — the pane leaves the window, the state does not blink',
        caption: 'The workbench detaches to its OWN OS window. Both windows share ONE app-worker heap: the component instance reparents — it is never recreated.',
        steps  : [
            {type: 'pause', ms: 900, cue: {type: 'perspective-load', name: 'Review'}, caption: 'back to "Review" — room to leave from'},
            {type: 'pause', ms: 900},
            {
                type             : 'cross-window',
                itemId           : 'workbench',
                sourceWorkspaceId: 'demo-b-main',
                targetWorkspaceId: 'demo-b-popup',
                targetNodeId     : 'popup-tabs',
                caption          : 'drag(workbench → popup): one real pointer gesture crosses two active OS windows. The worker instance and counter never reset.'
            },
            {type: 'pause', ms: 2000},
            {type: 'pause', ms: 600, cue: {type: 'perspective-save', name: 'Detached', scope: 'topology'}, caption: 'save("Detached"): topology capture records BOTH worker-owned workspace documents — main plus popup'},
            {type: 'pause', ms: 900, cue: {type: 'reattach', itemId: 'workbench'}, caption: 'reattach(workbench): home again. Same instance, same count — reparent, never recreate.'},
            {type: 'pause', ms: 1200}
        ]
    }, {
        id     : 's4',
        title  : 'Changed topology — restore truth, never summon a window',
        caption: '"Detached" captured two worker-owned workspace documents. Only the main window is live now, so reconciliation applies what fits and renders the exact remainder.',
        steps  : [
            {type: 'pause', ms: 1400, cue: {type: 'perspective-load', name: 'Detached'}, caption: 'reconcile("Detached"): no popup is spawned; Workbench is reported unrestored with reason no-live-workspace, and displaced primary content is named'},
            {
                type   : 'topology-assert',
                caption: 'the coverable primary slot committed, while the dedicated report strip keeps the missing popup slot visible',
                expect : [{path: 'items.inspector.title', equals: 'Inspector'}]
            },
            {type: 'pause', ms: 1400, cue: {type: 'perspective-load', name: 'Focus'}, caption: 'load("Focus"): the finale brings it home — and the counter STILL never reset, even undocked'},
            {type: 'pause', ms: 900}
        ]
    }]
});
