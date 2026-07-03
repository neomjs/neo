import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockSplitterTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockLayoutAdapter from '../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockSplitter      from '../../../../src/dashboard/DockSplitter.mjs';

const createDocument = () => ({
    schema: 'neo.harness.dockZone.v1',
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

test.describe('Neo.dashboard.DockSplitter', () => {
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
                dragEnd: () => {}
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
            dragEnd: () => {}
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
            boundaryIndex  : 0,
            id             : 'dock-splitter-reducer',
            onDockZoneDocumentChange(document, descriptor, instance) {
                notifyCalls.push({document, descriptor, instance})
            },
            orientation    : 'horizontal',
            parentComponent: parent,
            splitNodeId    : 'root'
        });

        splitter.dragZone = {
            dragEnd: () => {}
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
            orientation     : 'horizontal',
            parentComponent : parent,
            splitNodeId     : 'root'
        });

        splitter.dragZone = {
            dragEnd: () => {}
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
});
