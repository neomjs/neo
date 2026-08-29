import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockRailTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import Button            from '../../../../src/button/Base.mjs';
import DockLayoutAdapter from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockRail          from '../../../../src/dashboard/dock/interaction/Rail.mjs';
import Panel             from '../../../../src/dashboard/Panel.mjs';

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
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

// Rail children = tab buttons + the composed reveal overlay; tabs carry a dockItemId.
const tabsOf = rail => (rail.items || []).filter(item => item.dockItemId != null);

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

test.describe('Neo.dashboard.dock.interaction.Rail', () => {
    let rail;

    test.afterEach(() => {
        rail?.destroy();
        rail = null
    });

    test('renders railItems as real button children and reconciles in place (object permanence)', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-reactive',
            railItems: createRailItems()
        });

        expect(rail.cls).toContain('neo-dashboard-dock-edge-rail-right');
        expect(rail.layout.ntype).toContain('vbox');
        expect(tabsOf(rail)).toHaveLength(1);
        expect(tabsOf(rail)[0].text).toBe('Terminal');
        expect(tabsOf(rail)[0].dockItemId).toBe('terminal');
        expect(tabsOf(rail)[0].flex).toBe('none');
        expect(tabsOf(rail)[0].wrapperStyle.flex).toBe('none');

        let terminalButton = tabsOf(rail)[0];

        // Model flip: a second item rails — the surviving tab keeps its LIVE component instance.
        rail.railItems = [
            ...createRailItems(),
            {dockEdge: 'right', dockItemId: 'inspector', restorable: true, title: 'Inspector'}
        ];

        expect(tabsOf(rail)).toHaveLength(2);
        expect(tabsOf(rail)[0]).toBe(terminalButton);
        expect(tabsOf(rail)[1].text).toBe('Inspector');
        expect(tabsOf(rail).map(tab => tab.flex)).toEqual(['none', 'none']);
        expect(tabsOf(rail).map(tab => tab.wrapperStyle.flex)).toEqual(['none', 'none']);

        // Title flips update the surviving instance in place; leavers are removed.
        rail.railItems = [{dockEdge: 'right', dockItemId: 'terminal', restorable: true, title: 'Console'}];

        expect(tabsOf(rail)).toHaveLength(1);
        expect(tabsOf(rail)[0]).toBe(terminalButton);
        expect(tabsOf(rail)[0].text).toBe('Console');

        // ...and the empty rail renders no tabs (the composed overlay child remains).
        rail.railItems = [];

        expect(tabsOf(rail)).toHaveLength(0);
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

        // The click path is button.Base's own handler contract; we invoke the handler the way
        // the button does: with the click data carrying the button component.
        let snapshot = rail.onTabClick({component: rail.items[0]});

        expect(snapshot).toEqual({revealedItemId: 'terminal', state: 'revealed-focused'});
        expect(committed).toHaveLength(0);
        expect(reveals).toHaveLength(1);
        expect(reveals[0].railItem.dockItemId).toBe('terminal');

        snapshot = rail.onTabClick({component: rail.items[0]});

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

        rail.onTabClick({component: rail.items[0]});
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
        rail.onTabClick({component: rail.items[0]});

        let result = rail.onRevealPinRequested({itemId: 'terminal'});

        expect(result.errors).toEqual([]);
        expect(result.document.items.terminal.pinned).toBe(true);
        expect(result.document.items.terminal.autoHidden).toBe(false);
        expect(rail.revealMachine.state).toBe('idle');
        expect(changes).toHaveLength(1);
        expect(operations).toHaveLength(1);
        expect(operations[0].descriptor).toEqual({itemId: 'terminal', operation: 'setItemPinned', pinned: true});
    });

    test('pin policy: the tab stays a live enabled button (reveal is policy-free); pin rejects locally', () => {
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

        // Reveal is policy-free: a disabled tab would make the item's content unreachable.
        expect(rail.items[0].disabled).toBe(false);

        let snapshot = rail.onTabClick({component: rail.items[0]});
        expect(snapshot.state).toBe('revealed-focused');

        let result = rail.onRevealPinRequested({itemId: 'terminal'});

        expect(committed).toHaveLength(0);
        expect(result.errors.join(' ')).toContain('blocked by policy');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].descriptor).toBeNull();
        expect(rejected[0].itemId).toBe('terminal');
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

        rail.onTabHoverIn({component: rail.items[0]});
        expect(rail.revealMachine.state).toBe('idle');

        rail.autoHideRevealOnHover = true;

        rail.onTabHoverIn({component: rail.items[0]});
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

        rail.onTabClick({component: rail.items[0]});

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
        rail.onTabClick({component: rail.items[0]});
        overlay.fire('revealEscape', {});
        expect(rail.revealMachine.state).toBe('idle');
    });

    test('self-hosts a composed reveal overlay child and materializes the pane through resolveComponentRef', () => {
        rail = Neo.create(DockRail, {
            dockZoneDocument   : createDocument(),
            edge               : 'right',
            id                 : 'dock-rail-composed-overlay',
            railItems          : createRailItems(),
            resolveComponentRef: componentRef => ({ntype: 'component', html: componentRef})
        });

        // Composed from construct: the overlay child exists idle-hidden before any reveal —
        // the rail's subtree never changes shape post-mount for the reveal path.
        expect(rail.revealOverlay?.ntype).toBe('dashboard-dock-reveal-overlay');
        expect(rail.revealOverlay.visible).toBe(false);

        rail.onTabClick({component: rail.items[0]});

        let overlay = rail.revealOverlay;

        expect(overlay?.ntype).toBe('dashboard-dock-reveal-overlay');
        expect(rail.items).toContain(overlay);
        expect(overlay.revealState).toBe('revealed-focused');
        expect(overlay.titleLabel.text).toBe('Terminal');
        expect(overlay.paneSlot.items).toHaveLength(1);
        expect(overlay.paneSlot.items[0].html).toBe('terminal');

        // Dismissal destroys the transient pane — reveal artifacts never outlive the reveal.
        rail.revealMachine.escape();

        expect(overlay.revealState).toBe('idle');
        expect(overlay.visible).toBe(false);
        expect(overlay.paneSlot.items).toHaveLength(0);

        // The reconcile sweep must never mistake the overlay child for a leaving tab.
        rail.railItems = [];

        expect(rail.items).toContain(overlay);
    });

    test('a resolver-returned live instance is parked on dismissal and re-parented on re-reveal (never destroyed)', () => {
        let livePane = Neo.create(Button, {id: 'dock-rail-live-pane', text: 'Live'});

        livePane.transientState = 'survives';

        rail = Neo.create(DockRail, {
            dockZoneDocument   : createDocument(),
            edge               : 'right',
            id                 : 'dock-rail-live-instance',
            railItems          : createRailItems(),
            resolveComponentRef: () => livePane
        });

        rail.onTabClick({component: tabsOf(rail)[0]});

        let slot = rail.revealOverlay.paneSlot;

        expect(slot.items[0]).toBe(livePane);

        // Dismissal PARKS the live instance — identity and transient state survive.
        rail.revealMachine.escape();

        expect(slot.items).toHaveLength(0);
        expect(livePane.isDestroyed).not.toBe(true);
        expect(livePane.transientState).toBe('survives');

        // Re-reveal re-parents the SAME instance.
        rail.onTabClick({component: tabsOf(rail)[0]});

        expect(slot.items[0]).toBe(livePane);
        expect(slot.items[0].id).toBe('dock-rail-live-pane');
    });

    test('blueprint fallback: a resolver miss materializes item.blueprint; identity survives re-reveal', () => {
        let document = createDocument();

        document.items.terminal.blueprint = {html: 'blueprint-pane', ntype: 'component'};

        rail = Neo.create(DockRail, {
            dockZoneDocument   : document,
            edge               : 'right',
            id                 : 'dock-rail-blueprint',
            railItems          : createRailItems(),
            resolveComponentRef: () => null
        });

        rail.onTabClick({component: tabsOf(rail)[0]});

        let slot = rail.revealOverlay.paneSlot,
            pane = slot.items[0];

        expect(pane?.html).toBe('blueprint-pane');

        // Parked on dismissal, re-parented on re-reveal — same cache discipline as live instances.
        rail.revealMachine.escape();

        expect(slot.items).toHaveLength(0);
        expect(pane.isDestroyed).not.toBe(true);

        rail.onTabClick({component: tabsOf(rail)[0]});

        expect(slot.items[0]).toBe(pane);
    });

    test('recoverable placeholder when neither a live instance nor a blueprint resolves', () => {
        rail = Neo.create(DockRail, {
            dockZoneDocument   : createDocument(),
            edge               : 'right',
            id                 : 'dock-rail-placeholder',
            railItems          : createRailItems(),
            resolveComponentRef: () => null
        });

        rail.onTabClick({component: tabsOf(rail)[0]});

        let pane = rail.revealOverlay.paneSlot.items[0];

        expect(pane).toBeTruthy();
        expect(pane.cls).toContain('neo-dashboard-dock-placeholder');
        expect(pane.dockItemId).toBe('terminal');

        // Adapter-only fields, absent from the inline factory fallback: these turn red if the
        // runtime namespace lookup ever misses and the optional chain degrades the placeholder.
        expect(pane.ntype).toBe('dashboard-panel');
        expect(pane.header).toMatchObject({dockItemId: 'terminal', text: 'Terminal'});
        // the `data` getter is the state-provider shortcut; the adapter's payload rides the raw config
        expect(pane._data?.missingComponentRef).toBe(true);
    });

    test('threads the workspace default reveal fraction into the bound overlay', () => {
        let overlay = createStubOverlay();

        rail = Neo.create(DockRail, {
            defaultRevealFraction: 0.4,
            edge                 : 'right',
            id                   : 'dock-rail-fraction',
            railItems            : createRailItems()
        });

        rail.bindRevealOverlay(overlay);
        rail.onTabClick({component: tabsOf(rail)[0]});

        expect(overlay.calls.at(-1).defaultRevealFraction).toBe(0.4);
    });

    test('an item leaving the rail fail-closes its reveal', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-fail-close',
            railItems: createRailItems()
        });

        rail.onTabClick({component: rail.items[0]});
        expect(rail.revealMachine.state).toBe('revealed-focused');

        rail.railItems = [];

        expect(rail.revealMachine.state).toBe('idle');
    });

    test('ignores clicks that do not resolve to a rail-tab button', () => {
        rail = Neo.create(DockRail, {
            id       : 'dock-rail-unknown',
            railItems: createRailItems()
        });

        expect(rail.onTabClick({component: {}})).toBeNull();
        expect(rail.onTabClick({})).toBeNull();
    });
});

test.describe('Neo.dashboard.dock.interaction.Rail — revealed-tab state projection', () => {
    let rail;

    test.afterEach(() => {
        rail?.destroy?.();
        rail = null
    });

    test('the revealed tab is marked, its siblings are cleared, and dismissal clears them all', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-revealed-state',
            railItems: [
                {dockEdge: 'right', dockItemId: 'terminal', restorable: true, title: 'Terminal'},
                {dockEdge: 'right', dockItemId: 'output',   restorable: true, title: 'Output'}
            ]
        });

        const pressedIds = () => tabsOf(rail).filter(tab => tab.pressed).map(tab => tab.dockItemId);

        // Two tabs, not one, on purpose: a projection that only SETS would pass a single-tab arm
        // while leaving every previously-revealed tab latched. Clearing is the half that needs a
        // sibling to be observable at all.
        expect(tabsOf(rail)).toHaveLength(2);
        expect(pressedIds(), 'a rail with nothing revealed marks nothing').toEqual([]);

        rail.syncRevealedTabState('terminal');
        expect(pressedIds(), 'the revealed tab is the only one marked').toEqual(['terminal']);

        // RETARGET without an intervening dismissal — the transition that latches if the projection
        // sets the new tab without clearing the old one.
        rail.syncRevealedTabState('output');
        expect(pressedIds(), 'retargeting moves the mark rather than accumulating it').toEqual(['output']);

        rail.syncRevealedTabState(null);
        expect(pressedIds(), 'dismissal clears every mark').toEqual([]);
    });

    test('an unknown item id marks nothing, rather than throwing or latching the previous tab', () => {
        rail = Neo.create(DockRail, {
            edge     : 'right',
            id       : 'dock-rail-revealed-unknown',
            railItems: createRailItems()
        });

        rail.syncRevealedTabState('terminal');
        expect(tabsOf(rail).filter(tab => tab.pressed)).toHaveLength(1);

        // A stale id can arrive from a machine snapshot taken before a model flip retired the item.
        // The rail must fall to "nothing revealed" rather than keep painting a tab that no longer
        // corresponds to what the overlay hosts.
        rail.syncRevealedTabState('a-retired-item');
        expect(tabsOf(rail).filter(tab => tab.pressed), 'a stale id clears rather than latches').toHaveLength(0);
    });
});
