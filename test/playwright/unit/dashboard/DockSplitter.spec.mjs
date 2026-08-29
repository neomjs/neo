import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockSplitterTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockLayoutAdapter from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockSplitter      from '../../../../src/dashboard/dock/interaction/DockSplitter.mjs';

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        left : {componentRef: 'left', title: 'Left'},
        right: {componentRef: 'right', title: 'Right'}
    },
    nodes: {
        root: {
            type       : 'split',
            orientation: 'horizontal',
            children   : ['left-tabs', 'right-tabs'],
            sizes      : [0.7, 0.3]
        },
        'left-tabs': {
            type        : 'tabs',
            items       : ['left'],
            activeItemId: 'left'
        },
        'right-tabs': {
            type        : 'tabs',
            items       : ['right'],
            activeItemId: 'right'
        }
    }
});

const createParent = () => ({
    disabled: false,
    id      : 'dock-parent',
    items   : [
        {dockNodeType: 'tabs', flex: 0.7, id: 'left-component'},
        {dockNodeType: 'splitter', id: 'dock-splitter-placeholder'},
        {dockNodeType: 'tabs', flex: 0.3, id: 'right-component'}
    ],
    getDomRect(ids) {
        return Promise.resolve(ids.map(id => {
            if (id === 'dock-parent') {
                return {height: 500, width: 1000, x: 0, y: 0}
            }

            if (id === 'left-component') {
                return {height: 500, width: 700, x: 0, y: 0}
            }

            return {height: 500, width: 300, x: 700, y: 0}
        }))
    }
});

const createEdgeDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        center: {componentRef: 'center', title: 'Center'},
        left  : {componentRef: 'left', title: 'Left'}
    },
    nodes: {
        root: {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'center-tabs'},
                left  : {nodeId: 'left-tabs', extent: 0.2, resizable: true}
            }
        },
        'center-tabs': {type: 'tabs', items: ['center'], activeItemId: 'center'},
        'left-tabs'  : {type: 'tabs', items: ['left'], activeItemId: 'left'}
    }
});

const createEdgeParent = () => ({
    disabled: false,
    id      : 'edge-parent',
    items   : [
        {dockNodeType: 'tabs', id: 'left-component', vdom: {id: 'left-wrapper'}},
        {dockNodeType: 'splitter', id: 'edge-splitter-placeholder'},
        {dockNodeType: 'tabs', flex: 1, id: 'center-component', vdom: {id: 'center-wrapper'}}
    ],
    getDomRect(ids) {
        return Promise.resolve(ids.map(id => {
            if (id === 'edge-parent') return {height: 600, width: 1000, x: 0, y: 0};
            if (id === 'left-component') return {height: 600, width: 200, x: 0, y: 0};
            return {height: 600, width: 794, x: 206, y: 0}
        }))
    },
    indexOf(item) {
        return this.items.indexOf(item)
    }
});

const createEdgeSplitter = config => {
    const instance = Neo.create(DockSplitter, {
        data: {
            dockNodeId: 'root',
            edge      : 'left',
            edgeZoneId: 'root',
            operation : 'resizeEdgeZone'
        },
        dockZoneDocument: createEdgeDocument(),
        edge            : 'left',
        edgeZoneId      : 'root',
        liveResize      : true,
        orientation     : 'horizontal',
        parentComponent : createEdgeParent(),
        resizeTarget    : 'previous',
        ...config
    });

    instance.dragZone = {
        destroy     : () => {}, dragEnd: () => {}, isDestroyed: false, registerZone: async () => {}, set: () => {},
        settleResize: () => {}
    };
    instance.dockNodeType    = 'splitter';
    instance.parent.items[1] = instance;

    return instance
};

test.describe('Neo.dashboard.dock.interaction.DockSplitter', () => {
    let splitter;

    test.afterEach(() => {
        splitter?.destroy();
        splitter = null
    });

    test('commits drag completion through resizeSplit without mutating sibling styles', async () => {
        let parent     = createParent(),
            document   = createDocument(),
            events     = [],
            original   = DockLayoutAdapter.createResizeSplitOperation,
            operations = [];

        DockLayoutAdapter.createResizeSplitOperation = function(splitterInstance, sizes) {
            operations.push({sizes: sizes?.slice?.() || sizes, splitter: splitterInstance});

            return original.call(this, splitterInstance, sizes)
        };

        try {
            splitter = Neo.create(DockSplitter, {
                boundaryIndex   : 0,
                dockZoneDocument: document,
                id              : 'dock-splitter-commit',
                orientation     : 'horizontal',
                parentComponent : parent,
                splitNodeId     : 'root'
            });

            splitter.dragZone = {
                destroy: () => {}, dragEnd: () => {}, isDestroyed: false, registerZone: async () => {}, set: () => {}
            };
            splitter.on('dockSplitterResize', data => events.push(data));

            await splitter.captureDragStart({clientX: 100, clientY: 0});
            const result = splitter.onDragEnd({clientX: 0, clientY: 0});

            expect(operations).toHaveLength(1);
            expect(operations[0].splitter).toBe(splitter);
            expect(operations[0].sizes).toEqual([600, 400]);
            expect(result.errors).toEqual([]);
            expect(result.document.nodes.root.sizes).toEqual([0.6, 0.4]);
            expect(splitter.dockZoneDocument.nodes.root.sizes).toEqual([0.6, 0.4]);
            expect(document.nodes.root.sizes).toEqual([0.7, 0.3]);
            expect(splitter.parent.items[0].style).toBeUndefined();
            expect(splitter.parent.items[2].style).toBeUndefined();
            expect(splitter.parent.disabled).toBe(false);
            expect(events).toHaveLength(1);
            expect(events[0].descriptor).toEqual({
                operation  : 'resizeSplit',
                sizes      : [600, 400],
                splitNodeId: 'root'
            })
        } finally {
            DockLayoutAdapter.createResizeSplitOperation = original
        }
    });

    test('leaves the document unchanged when the resolved size vector is rejected', async () => {
        let parent   = createParent(),
            document = createDocument(),
            rejected = [];

        splitter = Neo.create(DockSplitter, {
            boundaryIndex   : 0,
            dockZoneDocument: document,
            id              : 'dock-splitter-reject',
            orientation     : 'horizontal',
            parentComponent : parent,
            splitNodeId     : 'root'
        });

        splitter.dragZone = {
            destroy: () => {}, dragEnd: () => {}, isDestroyed: false, registerZone: async () => {}, set: () => {}
        };
        splitter.on('dockSplitterResizeRejected', data => rejected.push(data));

        await splitter.captureDragStart({clientX: 100, clientY: 0});
        const result = splitter.onDragEnd({clientX: 900, clientY: 0});

        expect(result.errors.join(' ')).toContain('must be greater than 0');
        expect(result.document.nodes.root.sizes).toEqual([0.7, 0.3]);
        expect(splitter.dockZoneDocument.nodes.root.sizes).toEqual([0.7, 0.3]);
        expect(document.nodes.root.sizes).toEqual([0.7, 0.3]);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].descriptor.sizes).toEqual([1500, -500])
    });

    test('commits through an owning applyDockZoneOperation reducer and notifies onDockZoneDocumentChange', async () => {
        let parent       = createParent(),
            committedDoc = {marker: 'from-reducer'},
            reducerCalls = [],
            notifyCalls  = [];

        // No dockZoneDocument supplied: the reducer path must be preferred over the local-document fallback.
        splitter = Neo.create(DockSplitter, {
            applyDockZoneOperation(descriptor, instance) {
                reducerCalls.push({descriptor, instance});
                return {document: committedDoc, errors: []}
            },
            boundaryIndex: 0,
            id           : 'dock-splitter-reducer',
            onDockZoneDocumentChange(document, descriptor, instance) {
                notifyCalls.push({document, descriptor, instance})
            },
            orientation    : 'horizontal',
            parentComponent: parent,
            splitNodeId    : 'root'
        });

        splitter.dragZone = {
            destroy: () => {}, dragEnd: () => {}, isDestroyed: false, registerZone: async () => {}, set: () => {}
        };

        await splitter.captureDragStart({clientX: 100, clientY: 0});
        const result = splitter.onDragEnd({clientX: 0, clientY: 0});

        // the owning reducer is consulted with the resize descriptor + the splitter instance
        expect(reducerCalls).toHaveLength(1);
        expect(reducerCalls[0].instance).toBe(splitter);
        expect(reducerCalls[0].descriptor).toEqual({operation: 'resizeSplit', sizes: [600, 400], splitNodeId: 'root'});

        // the reducer's returned document is adopted as the splitter's doc + handed to the notify callback
        expect(result.errors).toEqual([]);
        expect(result.document).toBe(committedDoc);
        expect(splitter.dockZoneDocument).toEqual(committedDoc); // adopted (the dockZoneDocument_ config clones on set)
        expect(notifyCalls).toHaveLength(1);
        expect(notifyCalls[0].document).toBe(committedDoc);
        expect(notifyCalls[0].descriptor).toEqual({operation: 'resizeSplit', sizes: [600, 400], splitNodeId: 'root'});
        expect(notifyCalls[0].instance).toBe(splitter)
    });

    test('does not adopt or notify when the owning reducer rejects the resize', async () => {
        let parent       = createParent(),
            reducerCalls = [],
            notified     = false,
            rejected     = [];

        splitter = Neo.create(DockSplitter, {
            applyDockZoneOperation(descriptor) {
                reducerCalls.push(descriptor);
                return {document: createDocument(), errors: ['rejected by reducer']}
            },
            boundaryIndex   : 0,
            dockZoneDocument: createDocument(),
            id              : 'dock-splitter-reducer-reject',
            onDockZoneDocumentChange() {
                notified = true
            },
            orientation    : 'horizontal',
            parentComponent: parent,
            splitNodeId    : 'root'
        });

        splitter.dragZone = {
            destroy: () => {}, dragEnd: () => {}, isDestroyed: false, registerZone: async () => {}, set: () => {}
        };
        splitter.on('dockSplitterResizeRejected', data => rejected.push(data));

        await splitter.captureDragStart({clientX: 100, clientY: 0});
        const result = splitter.onDragEnd({clientX: 0, clientY: 0});

        expect(reducerCalls).toHaveLength(1);                                    // the reducer WAS consulted
        expect(result.errors).toEqual(['rejected by reducer']);
        expect(notified).toBe(false);                                            // notify is gated on success — NOT fired
        expect(splitter.dockZoneDocument.nodes.root.sizes).toEqual([0.7, 0.3]);  // the local doc is left untouched
        expect(rejected).toHaveLength(1)                                         // the rejection event fired instead
    });

    test('edge terminal normalizes the bounded pixel preview into one resizeEdgeZone commit', async () => {
        let document   = createEdgeDocument(),
            operations = [];

        splitter = createEdgeSplitter({
            applyDockZoneOperation(descriptor) {
                operations.push(descriptor);
                return Neo.dashboard.dock.model.Operations.applyOperation(document, descriptor)
            },
            dockZoneDocument: document,
            id              : 'dock-edge-splitter-commit'
        });

        await splitter.captureDragStart({clientX: 200, clientY: 0});

        const result = splitter.onDragEnd({
            clientX         : 240,
            clientY         : 0,
            resizeAxis      : 'width',
            resizeGeneration: 7,
            resizeSize      : 240,
            resizeTargetId  : 'left-wrapper'
        });

        expect(operations).toEqual([{
            operation : 'resizeEdgeZone',
            edgeZoneId: 'root',
            edge      : 'left',
            extent    : 0.24
        }]);
        expect(result.errors).toEqual([]);
        expect(result.document.nodes.root.zones.left.extent).toBe(0.24);
        expect(splitter.getResizeConfig()).toEqual({
            axis                 : 'width',
            awaitWorkerSettlement: true,
            parentId             : 'edge-parent',
            preview              : true,
            resizeNext           : false,
            splitterSize         : 6,
            targetId             : 'left-wrapper'
        })
    });

    test('instance edge identity cannot be hijacked by colliding StateProvider data', () => {
        splitter = createEdgeSplitter({id: 'dock-edge-splitter-provider-collision'});

        splitter.getStateProvider = () => ({
            getHierarchyData: () => ({
                dockNodeId: 'provider-root',
                edge      : 'right',
                edgeZoneId: 'provider-root',
                operation : 'resizeEdgeZone'
            })
        });

        expect(DockLayoutAdapter.createResizeEdgeZoneOperation(splitter, 0.25)).toEqual({
            operation : 'resizeEdgeZone',
            edgeZoneId: 'root',
            edge      : 'left',
            extent    : 0.25
        });

        splitter.edge       = null;
        splitter.edgeZoneId = null;

        expect(splitter.isEdgeZoneResize(), 'provider data cannot reclassify a split affordance as an edge affordance')
            .toBe(false)
    });

    test('a cancelled edge terminal restores presentation and commits zero operations', async () => {
        const operations = [];

        splitter = createEdgeSplitter({
            applyDockZoneOperation(descriptor) {
                operations.push(descriptor);
                return {document: createEdgeDocument(), errors: []}
            },
            id: 'dock-edge-splitter-cancel'
        });

        await splitter.captureDragStart({clientX: 200, clientY: 0});
        splitter.onDragEnd({cancelled: true, clientX: 240, clientY: 0, resizeSize: 240});

        expect(operations).toEqual([]);
        expect(splitter.dragStartState).toBeNull()
    });

    test('Escape cancel retires the dock geometry snapshot without waiting for drag:end', async () => {
        const operations = [];

        splitter = createEdgeSplitter({
            applyDockZoneOperation(descriptor) {
                operations.push(descriptor);
                return {document: createEdgeDocument(), errors: []}
            },
            id: 'dock-edge-splitter-escape'
        });

        await splitter.captureDragStart({clientX: 200, clientY: 0});
        expect(splitter.dragStartState).not.toBeNull();

        splitter.onDragCancel({key: 'Escape'});

        expect(operations).toEqual([]);
        expect(splitter.dragStartState).toBeNull()
    });

    test('a rejected edge terminal restores the exact pending main-thread preview', async () => {
        const document    = createEdgeDocument(),
              notifies    = [],
              settlements = [];

        splitter = createEdgeSplitter({
            applyDockZoneOperation() {
                return {document, errors: ['rejected edge extent']}
            },
            dockZoneDocument: document,
            id              : 'dock-edge-splitter-reject',
            onDockZoneDocumentChange(current, descriptor, instance) {
                notifies.push({current, descriptor, instance})
            }
        });

        splitter.dragZone.settleResize = data => settlements.push(data);

        await splitter.captureDragStart({clientX: 200, clientY: 0});
        const result = splitter.onDragEnd({
            clientX         : 240,
            clientY         : 0,
            resizeGeneration: 9,
            resizeSize      : 240,
            resizeTargetId  : 'left-wrapper'
        });

        expect(result.errors).toEqual(['rejected edge extent']);
        expect(notifies, 'unchanged projection is not a presentation rollback mechanism').toEqual([]);
        expect(settlements).toEqual([{
            resizeGeneration: 9,
            resizeTargetId  : 'left-wrapper',
            restore         : true
        }]);
        expect(document.nodes.root.zones.left.extent).toBe(0.2)
    });
});

test.describe('Neo.dashboard.dock.interaction.DockSplitter — drag-proxy token projection', () => {
    /**
     * The projection restates the `--dock-splitter-*` contract in JS, and a restatement drifts.
     * This is the guard that makes the restatement safe: it parses the engine's own `.neo-dashboard`
     * block and fails when the two sets diverge, so a token added to the stylesheet without a line
     * in `proxyProjectedTokens` turns this red instead of silently vanishing from every drag proxy.
     *
     * Parsing the SSOT rather than pinning a count on purpose — a count arm would pass whenever an
     * addition and a removal cancelled out.
     */
    test('the projected token list matches the engine stylesheet exactly, in both directions', async () => {
        const fs   = await import('node:fs/promises'),
              path = await import('node:path'),
              url  = await import('node:url');

        const scssPath = path.resolve(
            path.dirname(url.fileURLToPath(import.meta.url)),
            '../../../../resources/scss/src/dashboard/Container.scss'
        );

        const source = await fs.readFile(scssPath, 'utf8'),
              open   = source.indexOf('.neo-dashboard {'),
              block  = source.slice(open, source.indexOf('\n}', open));

        expect(open, 'the .neo-dashboard token block must be locatable').toBeGreaterThan(-1);

        const declared = [...new Set(
            [...block.matchAll(/(--dock-splitter-[a-z-]+)\s*:/g)].map(match => match[1])
        )].sort();

        // Non-vacuity: a regex that matched nothing would make the comparison below trivially
        // satisfiable by an empty projection list.
        expect(declared.length, 'the parse must find the engine tokens, not silently match nothing')
            .toBeGreaterThan(5);

        expect([...DockSplitter.proxyProjectedTokens].sort(),
            'every engine splitter token is projected, and nothing is projected that the engine does not declare'
        ).toEqual(declared)
    })
});
