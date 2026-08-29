/**
 * @summary Workstation's data-only `neo.tour.script.v1` screenplay and opening dock document.
 *
 * Twenty live items prove workstation density rather than catalog density. The dominant
 * scale grid and the live feed remain mounted as the screenplay resizes a real split,
 * opens the real overflow menu, scrolls the 100k grid, drives one tab across two live
 * dropzone placements, promotes a heavy tab through the shipped `splitNode` descriptor,
 * returns it through `addTab`, and flips both themes. Surface cues are visual actions;
 * every document-tier operation remains deterministic.
 */

/**
 * The dense opening stage. Every catalog item is placed in the tree.
 *
 * Edge extents preserve both center panes at the 2560×1440 film stage. Ordinary desktop
 * sizes intentionally resolve to the theme's usability floors, while the resizable descriptors
 * retain the Engine's 50% per-edge agency after boot.
 * @type {Object}
 */
export const initialDocument = Object.freeze({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        scale    : {componentRef: 'Scale',     title: '100k Operations Matrix',       kind: 'grid'},
        feed     : {componentRef: 'Feed',      title: 'Live Event Stream',            kind: 'grid'},
        alerts   : {componentRef: 'Alerts',    title: 'Priority Alert Observatory',   kind: 'panel'},
        activity : {componentRef: 'Activity',  title: 'Resident Activity Timeline',   kind: 'panel'},
        topology : {componentRef: 'Topology',  title: 'Workspace Topology Inspector', kind: 'panel'},
        runtime  : {componentRef: 'Runtime',   title: 'Runtime Health Envelope',      kind: 'panel'},
        traces   : {componentRef: 'Traces',    title: 'Distributed Trace Explorer',   kind: 'panel'},
        logs     : {componentRef: 'Logs',      title: 'Structured Log Console',       kind: 'terminal'},
        console  : {componentRef: 'Console',   title: 'Command and Control Console',  kind: 'terminal'},
        builds   : {componentRef: 'Builds',    title: 'Build Pipeline Monitor',       kind: 'panel'},
        deploys  : {componentRef: 'Deploys',   title: 'Deployment Flight Deck',       kind: 'panel'},
        security : {componentRef: 'Security',  title: 'Security Signal Center',       kind: 'panel'},
        memory   : {componentRef: 'Memory',    title: 'Memory Pressure Telemetry',    kind: 'panel'},
        graph    : {componentRef: 'Graph',     title: 'Dependency Graph Explorer',    kind: 'panel', autoHidden: true},
        queues   : {componentRef: 'Queues',    title: 'Task Queue Pressure',          kind: 'panel'},
        metrics  : {componentRef: 'Metrics',   title: 'System Metrics',                kind: 'panel'},
        audit    : {componentRef: 'Audit',     title: 'Evidence Audit',               kind: 'panel'},
        commits  : {componentRef: 'Commits',   title: 'Commit Stream',                kind: 'panel'},
        files    : {componentRef: 'Files',     title: 'Workspace Files',              kind: 'panel'},
        inspector: {componentRef: 'Inspector', title: 'Selection Inspector',          kind: 'panel', autoHidden: true}
    },
    nodes: {
        root               : {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'split-main'},
                left  : {nodeId: 'left-tabs',   extent: 0.11, resizable: true},
                right : {nodeId: 'split-right', extent: 0.14, resizable: true},
                bottom: {nodeId: 'bottom-tabs', extent: 0.17, resizable: true}
            }
        },
        'split-main'       : {type: 'split', orientation: 'horizontal', children: ['scale-tabs', 'heavy-tabs'], sizes: [0.6, 0.4]},
        'scale-tabs'       : {type: 'tabs', items: ['scale'], activeItemId: 'scale'},
        'heavy-tabs'       : {type: 'tabs', items: ['alerts', 'activity', 'topology', 'runtime', 'traces', 'logs', 'console', 'builds', 'deploys', 'security', 'memory', 'files'], activeItemId: 'alerts'},
        'left-tabs'        : {type: 'tabs', items: ['queues', 'graph'], activeItemId: 'queues'},
        'split-right'      : {type: 'split', orientation: 'vertical', children: ['right-top-tabs', 'right-bottom-tabs'], sizes: [0.5, 0.5]},
        'right-top-tabs'   : {type: 'tabs', items: ['metrics', 'audit'], activeItemId: 'metrics'},
        'right-bottom-tabs': {type: 'tabs', items: ['commits'], activeItemId: 'commits'},
        'bottom-tabs'      : {type: 'tabs', items: ['feed', 'inspector'], activeItemId: 'feed'}
    }
});

/**
 * The four-scene dense-workstation story. `promote` is prose only: the executable
 * vocabulary is the shipped `splitNode` + `addTab` pair; cross-zone choreography is
 * a real-input surface cue over the same preview-operation pipeline.
 * @type {Object}
 */
export const workstationTourScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'workstation-dense-tour',
    title : 'The content never stops living',

    workspace: {height: 1440, width: 2560},

    scenes: [{
        id     : 's1',
        title  : 'Dense overview — twenty panes, one living workspace',
        caption: 'A 100,000-row operations matrix keeps scrolling while a second store ingests ten events per second.',
        steps  : [{
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
            cue    : {type: 'overflow', itemId: 'security'},
            caption: 'the real overflow menu opens and activates a hidden resident through ordinary activeIndex'
        }, {
            type   : 'pause',
            ms     : 1400,
            cue    : {type: 'scroll', index: 50000},
            caption: 'the 100k grid crosses its midpoint without a blank frame'
        }]
    }, {
        id     : 's-cross-zone',
        title  : 'Dropzone choreography — every target answers the pointer',
        caption: 'One live tab crosses two foreign zones; an edge split and a center merge answer with distinct previews before release.',
        steps  : [{
            type: 'pause',
            ms  : 1600,
            cue : {
                type        : 'cross-zone-showcase',
                itemId      : 'audit',
                sourceNodeId: 'right-top-tabs',
                terminal    : 'commit',
                dwells      : [{
                    targetNodeId : 'scale-tabs',
                    placementKind: 'edge-bottom'
                }, {
                    targetNodeId : 'right-bottom-tabs',
                    placementKind: 'tab-into'
                }],
                options: {
                    dwellDelay: 700,
                    moveDelay : 24,
                    moveSteps : 18,
                    showCursor: true
                }
            },
            caption: 'Audit crosses the matrix split preview, then joins Commits through the live center target'
        }]
    }, {
        id     : 's2',
        title  : 'Promote — the workspace transforms around living content',
        caption: 'A heavy resident becomes its own split and returns; pane, grid, store, and component ownership remain stable.',
        steps  : [{
            type      : 'op',
            caption   : 'splitNode(security → below scale): promote through the shipped semantic operation',
            descriptor: {operation: 'splitNode', itemId: 'security', targetNodeId: 'scale-tabs', orientation: 'vertical', edge: 'bottom', sizes: [0.72, 0.28]},
            expect    : [{path: 'nodes.split-scale-tabs-0.children', equals: ['scale-tabs', 'tabs-security-0']}]
        }, {
            type   : 'pause',
            ms     : 1200,
            cue    : {type: 'canvas-update'},
            caption: 'a preserved visible Sparkline receives a new values array after the split and stays registered in the Canvas Worker'
        }, {
            type      : 'op',
            caption   : 'addTab(security → heavy): the promoted pane rejoins the dense group',
            descriptor: {operation: 'addTab', itemId: 'security', tabsNodeId: 'heavy-tabs'},
            expect    : [{path: 'nodes.heavy-tabs.activeItemId', equals: 'security'}]
        }]
    }, {
        id     : 's3',
        title  : 'Theme handoff — cold light, deep dark, same live state',
        caption: 'The skin changes; the two Store<Model> identities and their moving content do not.',
        steps  : [{
            type   : 'pause',
            ms     : 1600,
            cue    : {type: 'theme', theme: 'neo-theme-neo-light'},
            caption: 'light mode: workstation density stays legible'
        }, {
            type   : 'pause',
            ms     : 1600,
            cue    : {type: 'theme', theme: 'neo-theme-neo-dark'},
            caption: 'dark mode: the signature signal layer returns'
        }, {
            type   : 'topology-assert',
            caption: 'finale: every data surface remains live and security returns through the ordinary tab path',
            expect : [
                {path: 'nodes.split-main.children.0', equals: 'scale-tabs'},
                {path: 'nodes.split-main.sizes', equals: [0.52, 0.48]},
                {path: 'nodes.heavy-tabs.activeItemId', equals: 'security'},
                {path: 'nodes.heavy-tabs.items.11', equals: 'security'}
            ]
        }]
    }]
});
