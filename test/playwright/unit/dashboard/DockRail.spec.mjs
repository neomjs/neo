import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockRailTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DockRail       from '../../../../src/dashboard/DockRail.mjs';

const createDocument = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        editor  : {componentRef: 'editor', title: 'Editor'},
        terminal: {autoHidden: true, componentRef: 'terminal', title: 'Terminal'}
    },
    nodes: {
        root: {
            type : 'edge-zone',
            zones: {center: 'main-tabs', right: 'side-tabs'}
        },
        'main-tabs': {type: 'tabs', items: ['editor'],   activeItemId: 'editor'},
        'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
    }
});

const createRailItems = () => ([
    {dockEdge: 'right', dockItemId: 'terminal', restorable: true, title: 'Terminal'}
]);

test.describe('Neo.dashboard.DockRail', () => {
    let rail;

    test.afterEach(() => {
        rail?.destroy();
        rail = null
    });

    test('renders labeled tabs from railItems and updates in place on model flips (no remount)', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-reactive',
            railItems: createRailItems()
        });

        expect(rail.cls).toContain('neo-dashboard-dock-edge-rail-right');
        expect(rail.vdom.cn).toHaveLength(1);
        expect(rail.vdom.cn[0].tag).toBe('button');
        expect(rail.vdom.cn[0].text).toBe('Terminal');
        expect(rail.vdom.cn[0].data).toEqual({dockEdge: 'right', dockItemId: 'terminal', dockRailTab: true});
        expect(rail.vdom.cn[0].disabled).toBeNull();

        // Model flip: a second item rails — same instance, tab children re-render in place.
        rail.railItems = [
            ...createRailItems(),
            {dockEdge: 'right', dockItemId: 'inspector', restorable: true, title: 'Inspector'}
        ];

        expect(rail.id).toBe('dock-rail-reactive');
        expect(rail.vdom.cn).toHaveLength(2);
        expect(rail.vdom.cn[1].text).toBe('Inspector');

        // ...and clears the same way (the empty rail renders no tabs).
        rail.railItems = [];

        expect(rail.vdom.cn).toHaveLength(0);
    });

    test('restore rides the reducer callback: click commits setItemAutoHidden(false)', () => {
        let descriptors = [],
            events      = [],
            nextDoc     = createDocument();

        nextDoc.items.terminal.autoHidden = false;

        rail = Neo.create(DockRail, {
            applyDockZoneOperation: (descriptor, railInstance) => {
                descriptors.push({descriptor, railInstance});
                return {document: nextDoc, errors: []}
            },
            edge     : 'right',
            id       : 'dock-rail-callback',
            railItems: createRailItems()
        });

        rail.on('dockRailRestore', data => events.push(data));

        let result = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(descriptors).toHaveLength(1);
        expect(descriptors[0].descriptor).toEqual({autoHidden: false, itemId: 'terminal', operation: 'setItemAutoHidden'});
        expect(descriptors[0].railInstance).toBe(rail);
        expect(result.errors).toEqual([]);
        // The config system clones object configs on set — value equality IS the contract here.
        expect(rail.dockZoneDocument).toEqual(nextDoc);
        expect(events).toHaveLength(1);
        expect(events[0].itemId).toBe('terminal');
        expect(events[0].descriptor.operation).toBe('setItemAutoHidden');
    });

    test('falls back to a local DockZoneModel commit and notifies the document listener', () => {
        let changes  = [],
            document = createDocument();

        rail = Neo.create(DockRail, {
            dockZoneDocument        : document,
            edge                    : 'right',
            id                      : 'dock-rail-local',
            onDockZoneDocumentChange: (doc, descriptor, railInstance) => changes.push({descriptor, doc, railInstance}),
            railItems               : createRailItems()
        });

        let result = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(result.errors).toEqual([]);
        expect(result.document.items.terminal.autoHidden).toBe(false);
        // The input document stays untouched — reducer immutability holds at the affordance level.
        expect(document.items.terminal.autoHidden).toBe(true);
        expect(rail.dockZoneDocument).toEqual(result.document);
        expect(changes).toHaveLength(1);
        expect(changes[0].doc).toBe(result.document);
        expect(changes[0].railInstance).toBe(rail);
    });

    test('policy: a non-restorable tab renders disabled and rejects locally without emitting an operation', () => {
        let committed = [],
            rejected  = [];

        rail = Neo.create(DockRail, {
            applyDockZoneOperation: descriptor => {
                committed.push(descriptor);
                return {document: null, errors: []}
            },
            edge     : 'right',
            id       : 'dock-rail-policy',
            railItems: [{dockEdge: 'right', dockItemId: 'terminal', restorable: false, title: 'Terminal'}]
        });

        rail.on('dockRailRestoreRejected', data => rejected.push(data));

        expect(rail.vdom.cn[0].disabled).toBe(true);
        expect(rail.vdom.cn[0].cls).toContain('neo-dashboard-dock-rail-tab-disabled');

        let result = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(committed).toHaveLength(0);
        expect(result.errors.join(' ')).toContain('blocked by policy');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].descriptor).toBeNull();
        expect(rejected[0].itemId).toBe('terminal');
    });

    test('an executor rejection surfaces as dockRailRestoreRejected with the document unchanged', () => {
        // Belt-and-braces: the projection says restorable, but the live document's policy flipped
        // between projection and click — the model guard answers, the rail relays honestly.
        let document = createDocument(),
            rejected = [];

        document.items.terminal.pinnable = false;

        rail = Neo.create(DockRail, {
            dockZoneDocument: document,
            edge            : 'right',
            id              : 'dock-rail-executor-reject',
            railItems       : createRailItems()
        });

        rail.on('dockRailRestoreRejected', data => rejected.push(data));

        let result = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(result.errors.join(' ')).toContain('not pinnable');
        expect(rail.dockZoneDocument.items.terminal.autoHidden).toBe(true);
        expect(rejected).toHaveLength(1);
    });

    test('ignores clicks that do not resolve to a known tab', () => {
        rail = Neo.create(DockRail, {
            id       : 'dock-rail-unknown',
            railItems: createRailItems()
        });

        expect(rail.onRailClick({currentTarget: 'not-a-tab'})).toBeNull();
        expect(rail.onRailClick({})).toBeNull();
    });
});
