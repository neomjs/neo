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

const createStubOverlay = () => ({
    calls    : [],
    listeners: {},
    fire(name, data) {
        this.listeners[name]?.call(this.listeners.scope, data)
    },
    on(map) {
        Object.assign(this.listeners, map)
    },
    set(config) {
        this.calls.push(config)
    }
});

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

    test('click opens a focused transient reveal WITHOUT emitting any operation; re-click dismisses', () => {
        let committed = [],
            reveals   = [];

        rail = Neo.create(DockRail, {
            applyDockZoneOperation: descriptor => {
                committed.push(descriptor);
                return {document: null, errors: []}
            },
            edge     : 'right',
            id       : 'dock-rail-click-reveal',
            railItems: createRailItems()
        });

        rail.on('dockRailRevealChange', data => reveals.push(data));

        let snapshot = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(snapshot).toEqual({revealedItemId: 'terminal', state: 'revealed-focused'});
        expect(committed).toHaveLength(0);
        expect(reveals).toHaveLength(1);
        expect(reveals[0].railItem.dockItemId).toBe('terminal');

        snapshot = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(snapshot).toEqual({revealedItemId: null, state: 'idle'});
        expect(committed).toHaveLength(0);
        expect(reveals).toHaveLength(2);
    });

    test('reveal state never persists: a full reveal/dismiss cycle leaves the document untouched', () => {
        let changes  = [],
            document = createDocument(),
            snapshot = JSON.stringify(document);

        rail = Neo.create(DockRail, {
            dockZoneDocument        : document,
            edge                    : 'right',
            id                      : 'dock-rail-no-persist',
            onDockZoneDocumentChange: () => changes.push(1),
            railItems               : createRailItems()
        });

        rail.onRailClick({currentTarget: `${rail.id}__tab-0`});
        rail.revealMachine.escape();

        expect(JSON.stringify(document)).toBe(snapshot);
        expect(JSON.parse(JSON.stringify(rail.dockZoneDocument))).toEqual(JSON.parse(snapshot));
        expect(changes).toHaveLength(0);
    });

    test('pin escape rides the executor: setItemPinned(true) commits, model clears autoHidden, reveal closes', () => {
        let changes    = [],
            document   = createDocument(),
            operations = [];

        rail = Neo.create(DockRail, {
            dockZoneDocument        : document,
            edge                    : 'right',
            id                      : 'dock-rail-pin',
            onDockZoneDocumentChange: (doc, descriptor) => changes.push({descriptor, doc}),
            railItems               : createRailItems()
        });

        rail.on('dockRailOperation', data => operations.push(data));
        rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        let result = rail.onRevealPinRequested({itemId: 'terminal'});

        expect(result.errors).toEqual([]);
        expect(result.document.items.terminal.pinned).toBe(true);
        expect(result.document.items.terminal.autoHidden).toBe(false);
        expect(rail.revealMachine.state).toBe('idle');
        expect(changes).toHaveLength(1);
        expect(operations).toHaveLength(1);
        expect(operations[0].descriptor).toEqual({itemId: 'terminal', operation: 'setItemPinned', pinned: true});
    });

    test('pin policy: tab stays clickable, pin request rejects locally without emitting an operation', () => {
        let committed = [],
            rejected  = [];

        rail = Neo.create(DockRail, {
            applyDockZoneOperation: descriptor => {
                committed.push(descriptor);
                return {document: null, errors: []}
            },
            edge     : 'right',
            id       : 'dock-rail-pin-policy',
            railItems: [{dockEdge: 'right', dockItemId: 'terminal', restorable: false, title: 'Terminal'}]
        });

        rail.on('dockRailOperationRejected', data => rejected.push(data));

        // Reveal is policy-free: the tab renders enabled — item content must stay reachable.
        expect(rail.vdom.cn[0].disabled).toBeUndefined();

        let snapshot = rail.onRailClick({currentTarget: `${rail.id}__tab-0`});
        expect(snapshot.state).toBe('revealed-focused');

        let result = rail.onRevealPinRequested({itemId: 'terminal'});

        expect(committed).toHaveLength(0);
        expect(result.errors.join(' ')).toContain('blocked by policy');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].descriptor).toBeNull();
    });

    test('a stale-projection pin surfaces the executor rejection with the document unchanged', () => {
        let document = createDocument(),
            rejected = [];

        document.items.terminal.pinnable = false;

        rail = Neo.create(DockRail, {
            dockZoneDocument: document,
            edge            : 'right',
            id              : 'dock-rail-pin-executor-reject',
            railItems       : createRailItems()
        });

        rail.on('dockRailOperationRejected', data => rejected.push(data));

        let result = rail.onRevealPinRequested({itemId: 'terminal'});

        expect(result.errors.join(' ')).toContain('not pinnable');
        expect(rail.dockZoneDocument.items.terminal.autoHidden).toBe(true);
        expect(rejected).toHaveLength(1);
    });

    test('hover input is inert without the workspace opt-in, live with it', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-hover-optin',
            railItems: createRailItems()
        });

        rail.onTabHoverIn({currentTarget: `${rail.id}__tab-0`});
        expect(rail.revealMachine.state).toBe('idle');

        rail.autoHideRevealOnHover = true;

        rail.onTabHoverIn({currentTarget: `${rail.id}__tab-0`});
        expect(rail.revealMachine.state).toBe('dwell-pending');

        rail.onTabHoverOut({});
        expect(rail.revealMachine.state).toBe('idle');
    });

    test('bindRevealOverlay: state pushes into the overlay; overlay intents feed back; focus-hold holds', () => {
        let overlay = createStubOverlay();

        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-overlay-binding',
            railItems: createRailItems()
        });

        rail.bindRevealOverlay(overlay);

        // Initial sync pushes the idle snapshot.
        expect(overlay.calls.at(-1)).toMatchObject({revealState: 'idle', revealedItem: null});

        rail.onRailClick({currentTarget: `${rail.id}__tab-0`});

        expect(overlay.calls.at(-1)).toMatchObject({
            edge       : 'right',
            revealState: 'revealed-focused'
        });
        expect(overlay.calls.at(-1).revealedItem.dockItemId).toBe('terminal');

        // FOCUS-HOLD: pointer leaving a focused reveal must not dismiss it.
        overlay.fire('revealPointerLeave', {});
        expect(rail.revealMachine.state).toBe('revealed-focused');

        // Focus leaving dismisses; the overlay receives the idle snapshot.
        overlay.fire('revealFocusLeave', {});
        expect(rail.revealMachine.state).toBe('idle');
        expect(overlay.calls.at(-1)).toMatchObject({revealState: 'idle', revealedItem: null});

        // Escape intent routes through as well.
        rail.onRailClick({currentTarget: `${rail.id}__tab-0`});
        overlay.fire('revealEscape', {});
        expect(rail.revealMachine.state).toBe('idle');
    });

    test('an item leaving the rail fail-closes its reveal', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-fail-close',
            railItems: createRailItems()
        });

        rail.onRailClick({currentTarget: `${rail.id}__tab-0`});
        expect(rail.revealMachine.state).toBe('revealed-focused');

        rail.railItems = [];

        expect(rail.revealMachine.state).toBe('idle');
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
