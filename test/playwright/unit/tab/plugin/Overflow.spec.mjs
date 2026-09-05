import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoTabOverflowPluginTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Component      from '../../../../../src/component/Base.mjs';

/**
 * @summary Reactive ancestor fixture for the inherited-theme overflow contract.
 */
class ThemeAncestor extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Tab.Plugin.Overflow.ThemeAncestor',
        theme_   : null
    }
}
ThemeAncestor = Neo.setupClass(ThemeAncestor);

/**
 * @summary Theme-less toolbar fixture whose nearest active theme is owned by its ancestor.
 */
class ThemeOwner extends ThemeAncestor {
    static config = {
        className: 'Test.Unit.Tab.Plugin.Overflow.ThemeOwner'
    }

    ancestor = null
    appName  = 'test-app'
    mounted  = false
    windowId = 1

    /**
     * Mirrors the component parent-chain seam observed by the overflow plugin.
     * @returns {ThemeAncestor[]}
     */
    getParents() {
        return [this.ancestor]
    }

    /**
     * Resolves the fixture's nearest active theme without declaring one on the owner.
     * @returns {String|null}
     */
    getTheme() {
        return this.theme || this.ancestor.theme
    }

    /**
     * Minimal event seam required by plugin.Base while this owner remains unmounted.
     */
    on() {}
}
ThemeOwner = Neo.setupClass(ThemeOwner);

/**
 * @summary Mountable control fixture: a real config-system instance, so the plugin's
 * `observeConfig('mounted')` render-truth projection edge fires exactly as it would on a
 * component embodiment, without needing the full button.Base construction unit mode lacks.
 */
class MountableControl extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Tab.Plugin.Overflow.MountableControl',
        mounted_ : false
    }

    isVnodeInitializing = false
    menuList = null

    /**
     * Alignment seam consumed by syncControl on mounted controls.
     */
    alignTo() {}

    /**
     * Re-arm seam; unused in these tests but part of the control contract.
     * @returns {Promise<void>}
     */
    initVnode() {
        return Promise.resolve()
    }
}
MountableControl = Neo.setupClass(MountableControl);

/**
 * @summary Reactive menu fixture for proving that an open Overflow menu keeps its record store
 * stable until the floating list unmounts.
 */
class MountableMenuList extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Tab.Plugin.Overflow.MountableMenuList',
        items_   : null,
        mounted_ : false
    }
}
MountableMenuList = Neo.setupClass(MountableMenuList);

/**
 * @summary Focused tests for the Neo.tab.plugin.Overflow re-entrancy contract — the part of
 * the runtime overflow plugin that must survive a resize / activation storm without stranding state.
 *
 * These pin the two failure modes a naked latch produced: a thrown measure freezing every future pass,
 * and a concurrent pass being silently dropped (leaving a stale split). The full measure/apply path is
 * exercised by the example + e2e; here the owner is a lean stub so the guard logic is isolated.
 */
test.describe('Neo.tab.plugin.Overflow (re-entrancy contract)', () => {
    let Overflow;

    test.beforeAll(async () => {
        // The plugin owns computeOverflow as its own static — no adapter import needed (the adapter chain
        // exits the test path with the tab-native re-home).
        Overflow = (await import('../../../../../src/tab/plugin/Overflow.mjs')).default
    });

    /**
     * A lean toolbar-owner stub: two header buttons, a controllable getDomRect, and an optional event
     * collector standing in for the owner's `fire` — attached before construction, because the plugin
     * runs its first projection pass while constructing against a mounted owner.
     */
    const createPlugin = (getDomRect, fire) => {
        const items = [{id: 'b1'}, {id: 'b2'}];

        const plugin = Neo.create(Overflow, {
            owner: {
                id            : 'tab-overflow-test-owner',
                appName       : 'test-app',
                dock          : 'top',
                mounted       : true,
                parent        : {activeIndex: 0, on() {}, un() {}},
                theme         : 'neo-theme-neo-dark',
                windowId      : 1,
                items,
                getActionItems: () => [],
                getTabButtons() { return this.items },
                getTheme       : function () { return this.theme },
                getDomRect,
                add            : () => ({}),
                addDomListeners: () => {},
                fire,
                on             : () => {},
                un             : () => {},
                remove         : () => {},
                up             : () => ({activeIndex: 0})
            }
        });

        plugin.control = null;

        return plugin
    };

    test('a getDomRect throw against a LIVE owner surfaces the defect (console.error) and still releases the latch', async () => {
        const plugin = createPlugin(async () => { throw new Error('live-owner programming defect') }),
              errors = [],
              orig   = console.error;

        console.error = (...args) => { errors.push(args) };

        try {
            await plugin.project(true).catch(() => {})
        } finally {
            console.error = orig
        }

        // owner.mounted stays true → the throw is a real defect: surfaced, not hidden behind a teardown-race assumption
        expect(errors.length, 'a throw against a mounted owner is surfaced via console.error').toBeGreaterThan(0);
        expect(plugin.measuring, 'the latch must reset in finally so the header keeps responding').toBe(false)
    });

    test('a getDomRect throw during a mid-measure TEARDOWN (owner unmounts) is swallowed — the expected race, no defect noise', async () => {
        // getDomRect is invoked as `owner.getDomRect(...)`, so `this` is the exact owner object project()
        // holds — flip its `mounted` there (a regular function, not an arrow) to simulate an unmount landing
        // mid-measure, just before the throw.
        const plugin = createPlugin(async function () { this.mounted = false; throw new Error('teardown race') });

        const errors = [],
              orig   = console.error;

        console.error = (...args) => { errors.push(args) };

        try {
            await plugin.project(true).catch(() => {})
        } finally {
            console.error = orig
        }

        // owner unmounted mid-measure → the throw is the ONE expected race: swallowed, and the latch still resets
        expect(errors.length, 'a teardown race is swallowed, not logged as a defect').toBe(0);
        expect(plugin.measuring, 'the latch still resets so future passes are not frozen').toBe(false)
    });

    test('a project() arriving during an in-flight pass is coalesced, then drained once — never dropped, so the last state wins', async () => {
        let release,
            gate       = new Promise(resolve => { release = resolve }),
            callCount  = 0;

        // first pass gates on getDomRect; the second project() call must queue rather than drop.
        // A wide extent (button-id calls → per-button rects; the extent call — an array led by the
        // owner id, optionally trailing the mounted control id — → one wide rect) keeps nothing
        // overflowing, so the pass completes cleanly through applySplit.
        const plugin = createPlugin(async ids => {
            callCount++;
            if (callCount === 1) { await gate }
            return ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]
        });

        const first = plugin.project(false); // enters, latches, awaits the gate

        await new Promise(resolve => setTimeout(resolve, 0));
        expect(plugin.measuring, 'the first pass holds the latch while measuring').toBe(true);

        plugin.project(true); // arrives mid-pass → must be remembered, not dropped

        expect(plugin.projectQueued, 'a concurrent pass is queued, not discarded').toBe(true);
        expect(plugin.queuedRecapture, 'the queued recapture is sticky-true').toBe(true);

        release();
        await first;

        // the drain re-ran; give the async re-run a tick to settle its own pass
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(plugin.projectQueued, 'the queued flag is consumed by the drain').toBe(false);
        expect(plugin.measuring, 'no pass is left latched').toBe(false)
    });

    test('the repartition lifecycle is published on the owner as one start/idle pair per transaction — a coalesced rerun keeps it open, a thrown measure still closes it', async () => {
        let release,
            callCount = 0;

        const
            gate   = new Promise(resolve => {release = resolve}),
            events = [];

        const plugin = createPlugin(async ids => {
            callCount++;
            if (callCount === 1) { await gate }
            return ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]
        }, (name, data) => events.push([name, data.owner === data.plugin.owner]));

        // Construction against a mounted owner runs the first pass; its measure blocks on the gate, so
        // the start edge is observable in flight, with the owner and plugin in its payload.
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(plugin.measuring, 'the construct-time pass holds the latch').toBe(true);
        expect(plugin.projectionBusy).toBe(true);
        expect(events, 'the start edge fired when the latch armed').toEqual([['overflowProjectionStart', true]]);

        // A pass requested mid-flight is the same transaction: no second start, no premature idle.
        plugin.project(true);

        expect(plugin.projectQueued).toBe(true);
        expect(events).toHaveLength(1);

        release();
        await plugin.whenProjectionIdle();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(plugin.measuring).toBe(false);
        expect(plugin.projectQueued).toBe(false);
        expect(events.map(([name]) => name), 'one pair for the pass and its coalesced rerun').toEqual(['overflowProjectionStart', 'overflowProjectionIdle']);
        expect(plugin.projectionBusy).toBe(false);

        // A later pass is a second transaction: a second pair, never an unbalanced edge.
        await plugin.project(false);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(events.map(([name]) => name)).toEqual(['overflowProjectionStart', 'overflowProjectionIdle', 'overflowProjectionStart', 'overflowProjectionIdle']);

        // A measure that throws against a live owner is caught, the latch releases, and the idle edge
        // still publishes — the pair never stays open on an error.
        const thrown = [],
              error  = console.error;

        let throwing;

        console.error = () => {};

        try {
            // the construct-time pass is the throwing one: caught, latch released, pair closed
            throwing = createPlugin(async () => { throw new Error('measure failed') }, name => thrown.push(name));
            await throwing.whenProjectionIdle();
            await new Promise(resolve => setTimeout(resolve, 0))
        } finally {
            console.error = error
        }

        expect(thrown).toEqual(['overflowProjectionStart', 'overflowProjectionIdle']);
        expect(throwing.measuring).toBe(false);
        expect(throwing.projectionBusy).toBe(false);

        // Idle paths that never armed a pass publish nothing: a destroying plugin resolves its waiters
        // silently, with no edge.
        const seen  = [],
              quiet = createPlugin(async () => [], name => seen.push(name));

        await new Promise(resolve => setTimeout(resolve, 0));

        const before = seen.length;

        quiet.isDestroying = true;
        await quiet.project(false);

        expect(seen.length, 'no pass, no edge').toBe(before)
    });

    test('action mode excludes its own geometry and visibility feedback, but not other actions', () => {
        const plugin = createPlugin(async () => []),
              own    = {hidden: false, id: 'overflow-action'},
              host   = {action: 'host', hidden: false, id: 'host-action'};
        let projections = 0;

        plugin.control              = own;
        plugin.owner.getActionItems = () => [own, host];
        plugin.project              = () => { projections++ };

        expect(plugin.getActionItems(), 'only the plugin contribution self-excludes').toEqual([host]);

        plugin.onActionVisibilityChange({component: own});
        expect(projections, 'the contribution hidden flip cannot re-enter its own partition').toBe(0);

        plugin.onActionVisibilityChange({component: host});
        plugin.onActionGeometryChange({component: own});
        expect(projections, 'host visibility and rendered contribution width remain live inputs').toBe(2);

        plugin.control = null
    });

    test('contribution retirement cannot start a projection after the destroy boundary', async () => {
        let geometryReads = 0;

        const plugin = createPlugin(async () => {
            geometryReads++;
            return []
        });

        await new Promise(resolve => setTimeout(resolve, 0));
        geometryReads = 0;
        plugin.isDestroying = true;

        await plugin.project(false);

        expect(geometryReads, 'the synchronous actionsChange from retirement performs no DOM round-trip').toBe(0)
    });

    test('a recapture restores hidden-button config and VDOM removal state atomically', async () => {
        const
            makeButton = id => ({
                hidden: id === 'b2',
                id,
                setSilent(values) { Object.assign(this, values) },
                show() {
                    this.hidden = false;
                    delete this.vdom.removeDom
                },
                vdom: {removeDom: true}
            }),
            buttons = [makeButton('b1'), makeButton('b2')],
            plugin  = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        plugin.owner.items         = buttons;
        plugin.owner.promiseUpdate = async () => {};
        plugin.owner.update        = () => {};

        await plugin.project(true);

        buttons.forEach(button => {
            expect(button.hidden).toBe(false);
            expect(button.vdom.removeDom,
                'silent visibility restoration must not strand a removeDom marker').toBeUndefined()
        })
    });

    test('all-fit teardown: syncControl destroys and nulls the control when the overflow set empties (so a later overflow recreates a fresh one, not a dead instance)', async () => {
        // A wide extent keeps nothing overflowing, so the create-time auto-project (onOwnerMounted) settles
        // cleanly with no control; await a tick so it does not race the direct syncControl call below.
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0));

        let destroyed = false;
        plugin.control = {destroy: () => { destroyed = true }};

        plugin.syncControl([], {activeIndex: 0}); // empty hiddenMeta → nothing overflows → teardown

        expect(destroyed, 'the control is destroyed when the overflow set empties').toBe(true);
        expect(plugin.control, 'the reference is cleared, so the next overflow builds a fresh control').toBe(null)
    });

    test('an open menu queues the latest complete projection until its clickable partition unmounts', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        const
            originalItems = [{text: 'Agents', handler() {}}],
            menuList      = Neo.create(MountableMenuList, {items: originalItems, mounted: true}),
            projections   = [];

        plugin.control = {
            alignTo() {},
            destroy() {},
            iconCls: 'fa fa-ellipsis',
            menuList,
            mounted: true
        };
        plugin.hiddenSignature = '0:Agents:fa fa-users';
        plugin.project = recapture => projections.push(recapture);

        expect(plugin.queueOpenMenuProjection(false)).toBe(true);
        expect(plugin.queueOpenMenuProjection(true)).toBe(true);

        expect(menuList.items.map(item => item.text),
            'a mounted menu keeps the records its rendered nodes address').toEqual(['Agents']);
        expect(plugin.menuProjectionQueued).toBe(true);
        expect(plugin.menuRecaptureQueued).toBe(true);
        expect(projections).toEqual([]);

        menuList.mounted = false;

        expect(projections).toEqual([true]);
        expect(plugin.menuProjectionQueued).toBe(false);
        expect(plugin.menuRecaptureQueued).toBe(false);

        menuList.destroy();
        plugin.destroy()
    });

    test('opening a menu restores the last committed header partition after recapture visibility', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        const
            makeButton = id => ({
                hidden: false,
                id,
                setSilent(values) { Object.assign(this, values) },
                vdom: {}
            }),
            buttons = [makeButton('b1'), makeButton('b2')];

        let updates = 0;

        plugin.appliedHiddenIds       = ['b2'];
        plugin.owner.getTabButtons    = () => buttons;
        plugin.owner.update           = () => updates++;
        plugin.restoreOpenMenuPartition();

        expect(buttons[0].hidden).toBe(false);
        expect(buttons[0].vdom.removeDom).toBeUndefined();
        expect(buttons[1].hidden).toBe(true);
        expect(buttons[1].vdom.removeDom).toBe(true);
        expect(updates).toBe(1);
        expect(plugin.owner.updateDepth).toBe(-1);

        plugin.destroy()
    });

    test('an owner theme change is carried onto the live out-of-tree control', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0));

        // The theme-change handler re-projects (render-truth edge); the all-fit stub extents then
        // reach syncControl's teardown, which destroys the control — the stub honors that contract.
        plugin.control = {destroy() {}, theme: 'neo-theme-neo-dark'};
        plugin.owner.theme = 'neo-theme-neo-light';
        plugin.onOwnerThemeChange();

        expect(plugin.control.theme, 'the floating control follows the source toolbar theme')
            .toBe('neo-theme-neo-light')
    });

    test('a body-mounted embodiment keeps a local theme carrier when its logical parent owns the same theme', () => {
        const
            parent = Neo.create(Component, {
                appName : 'test-app',
                id      : 'overflow-theme-logical-parent',
                theme   : 'neo-theme-neo-dark',
                windowId: 1
            }),
            control = Neo.create(Component, {
                appName        : 'test-app',
                parentComponent: parent,
                parentId       : 'document.body',
                theme          : 'neo-theme-neo-dark',
                windowId       : 1
            });

        try {
            expect(control.parent, 'focus ancestry still resolves through the logical owner').toBe(parent);
            expect(control.cls, 'CSS inheritance cannot cross the distinct document.body edge')
                .toContain('neo-theme-neo-dark');

            control.theme = 'neo-theme-neo-light';

            expect(control.cls).toContain('neo-theme-neo-light');
            expect(control.cls).not.toContain('neo-theme-neo-dark')
        } finally {
            control.destroy();
            parent.destroy()
        }
    });

    test('a toolbar with no declared theme carries its ancestor theme at creation and follows ancestor switches', async () => {
        const
            ancestor   = Neo.create(ThemeAncestor, {theme: 'neo-theme-neo-dark'}),
            owner      = Neo.create(ThemeOwner, {ancestor}),
            plugin     = Neo.create(Overflow, {owner}),
            origCreate = Neo.create;
        let createdConfig;

        Neo.create = config => {
            createdConfig = config;
            return {destroy: () => {}, theme: config.theme}
        };

        try {
            plugin.syncControl([{text: 'Agents', iconCls: 'fa fa-users', index: 0}], {activeIndex: 0});

            expect(owner.theme, 'the toolbar fixture deliberately declares no own theme').toBe(null);
            expect(createdConfig.theme, 'the floating control resolves the nearest active ancestor theme')
                .toBe('neo-theme-neo-dark');

            ancestor.theme = 'neo-theme-neo-light';
            await Promise.resolve();

            expect(plugin.control.theme, 'an ancestor theme switch reaches the out-of-tree control')
                .toBe('neo-theme-neo-light')
        } finally {
            Neo.create = origCreate;
            plugin.destroy();
            owner.destroy();
            ancestor.destroy()
        }
    });

    test('error → success: a failed measure pass releases the latch so the very next pass measures cleanly (no freeze)', async () => {
        // A `shouldThrow` latch controls WHICH pass fails, so the create-time auto-project (onOwnerMounted)
        // settles cleanly first and only the pass we choose throws.
        let   shouldThrow = false;
        const plugin      = createPlugin(async ids => {
            if (shouldThrow) { shouldThrow = false; throw new Error('transient measure failure') }
            return ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]
        });
        await new Promise(resolve => setTimeout(resolve, 0)); // auto-project settles (no throw)

        // Pass 1 surfaces the defect via console.error (RA-8) against the live owner — silence it; the point
        // of THIS test is that the failure does not freeze future passes.
        const orig = console.error;
        console.error = () => {};

        try {
            shouldThrow = true;
            await plugin.project(true).catch(() => {}); // pass 1: getDomRect throws → caught, latch released
            expect(plugin.measuring, 'the latch is released after the failed pass').toBe(false);
            await plugin.project(true);                 // pass 2: measures + applies cleanly
        } finally {
            console.error = orig
        }

        expect(plugin.measuring, 'the recovered pass also releases the latch — nothing is frozen').toBe(false)
    });

    test('recreation: after an all-fit teardown, a subsequent overflow enters the CREATE branch (fresh instance, not a reused reference)', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0)); // settle the create-time auto-project

        plugin.control = {destroy: () => {}};
        plugin.syncControl([], {activeIndex: 0}); // all-fit → teardown
        expect(plugin.control, 'torn down on all-fit').toBe(null);

        // A subsequent overflow must BUILD a fresh instance (the create branch), not reuse a reference. In
        // unit mode the real button.Base + menu.List construction needs `Neo.get` (unavailable here), so spy
        // `Neo.create` to assert the create is invoked + assigned rather than exercise full construction.
        const origCreate = Neo.create;
        let   createdConfig;
        Neo.create = config => {
            createdConfig = config;
            return {ntype: 'button', destroy: () => {}}
        };
        try {
            plugin.syncControl([{text: 'Agents', iconCls: 'fa fa-users', index: 0}], {activeIndex: 0})
        } finally {
            Neo.create = origCreate
        }

        expect(createdConfig, 'a subsequent overflow builds a fresh control via Neo.create').toBeTruthy();
        expect(createdConfig.theme, 'the body-mounted control owns the source toolbar theme')
            .toBe('neo-theme-neo-dark');
        expect(createdConfig.menu.cls, 'the generated menu exposes one app-neutral skin hook')
            .toEqual(['neo-tab-overflow-menu']);
        expect(createdConfig.menu.items, 'the menu config retains the exact hidden-tab projection')
            .toHaveLength(1);
        expect(createdConfig.parentComponent, 'the floating control keeps logical toolbar ancestry')
            .toBe(plugin.owner);
        expect(createdConfig.vdom['aria-label']).toBe('More tabs');
        expect(plugin.control, 'and assigns the fresh instance as the new control').not.toBeNull()
    });

    test('main-axis geometry reserves actions and maps all four toolbar orientations', async () => {
        const action  = {hidden: false, id: 'action-1'};
        let   actionX = 200,
            actionY  = 240;

        const plugin = createPlugin(async ids => ids.map(id => id === 'tab-overflow-test-owner'
            ? {height: 300, left: 0, top: 0, width: 240, x: 0, y: 0}
            : id === action.id
                ? {height: 20, left: actionX, top: actionY, width: 20, x: actionX, y: actionY}
                : {height: 130, width: 110}));

        await new Promise(resolve => setTimeout(resolve, 0));

        plugin.owner.getActionItems = () => [action];

        const geometry = {
            bottom: {actionAlign: 'r0-l0', dimension: 'width',  maxSize: 'maxWidth',  ownerAlign: 'r0-r0'},
            left  : {actionAlign: 'b0-t0', dimension: 'height', maxSize: 'maxHeight', ownerAlign: 'b0-b0'},
            right : {actionAlign: 'b0-t0', dimension: 'height', maxSize: 'maxHeight', ownerAlign: 'b0-b0'},
            top   : {actionAlign: 'r0-l0', dimension: 'width',  maxSize: 'maxWidth',  ownerAlign: 'r0-r0'}
        };

        Object.entries(geometry).forEach(([dock, expected]) => {
            plugin.owner.dock = dock;
            expect(plugin.getMainAxisConfig()).toEqual(expected);
            expect(plugin.getControlAlign()).toEqual({edgeAlign: expected.actionAlign, target: action.id})
        });

        let split;
        plugin.applySplit = (hidden, buttons, tabContainer, activeCap) => {
            split = {activeCap, hidden}
        };

        plugin.owner.dock = 'top';
        plugin.naturalWidths = {b1: 110, b2: 110};
        await plugin.project(false);

        expect(split.hidden, 'the first action starts at x=200 despite its 20px width').toEqual(['b2']);
        expect(split.activeCap).toMatchObject({maxSize: 'maxWidth', usable: 160});

        actionX             = 300;
        plugin.naturalWidths = {b1: 120, b2: 120};
        await plugin.project(false);

        expect(split.hidden, 'a tab-pushed action rail cannot enlarge the toolbar extent').toEqual(['b2']);
        expect(split.activeCap, 'the rendered action width bounds the pushed coordinate to the owner')
            .toMatchObject({maxSize: 'maxWidth', usable: 180});

        actionX              = 200;
        plugin.naturalWidths = {b1: 110, b2: 110};

        const bothButtons = plugin.owner.items;
        plugin.owner.items = [bothButtons[0]];
        plugin.naturalWidths = {b1: 230};
        await plugin.project(false);

        expect(split.hidden, 'one over-wide active tab stays visible without creating a menu').toEqual([]);
        expect(split.activeCap, 'the action boundary still caps that sole tab')
            .toMatchObject({maxSize: 'maxWidth', usable: 200});

        plugin.owner.items = bothButtons;

        plugin.owner.dock = 'right';
        plugin.naturalWidths = {b1: 130, b2: 130};
        await plugin.project(false);

        expect(split.hidden, 'the first action starts at y=240 despite its 20px height').toEqual(['b2']);
        expect(split.activeCap).toMatchObject({maxSize: 'maxHeight', usable: 200});

        action.hidden = true;
        expect(plugin.getControlAlign(), 'consumer-hidden actions do not reserve or anchor the control')
            .toEqual({edgeAlign: 'b0-b0', target: plugin.owner.id});

        action.hideMode = 'visibility';
        expect(plugin.getControlAlign(), 'visibility-hidden actions keep their reserved boundary')
            .toEqual({edgeAlign: 'b0-t0', target: action.id})
    });

    test('a dock-axis change defers recapture to the post-render owner resize', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner'
            ? [{height: 300, left: 0, top: 0, width: 1000, x: 0, y: 0}]
            : [{height: 20, width: 20}, {height: 20, width: 20}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        let recapture;
        plugin.project = value => {recapture = value};
        plugin.dockRecapturePending = true;

        plugin.onResize();

        expect(recapture, 'the rendered resize recaptures the new main-axis tab extents').toBe(true);
        expect(plugin.dockRecapturePending).toBe(false);

        plugin.onResize();
        expect(recapture, 'later ordinary resizes return to extent-only projection').toBe(false);

        plugin.destroy()
    });

    test('a projection requested during tab sorting queues until the stable snapshot is released', async () => {
        let measureCalls = 0,
            releaseDrag;

        const plugin = createPlugin(async ids => {
            measureCalls++;
            return ids[0] === 'tab-overflow-test-owner'
                ? [{height: 300, left: 0, top: 0, width: 1000, x: 0, y: 0}]
                : [{height: 20, width: 20}, {height: 20, width: 20}]
        });

        await new Promise(resolve => setTimeout(resolve, 0));

        const beforeDragMeasures = measureCalls;

        plugin.owner.sortZone = {
            dragEndActive: false,
            startIndex   : 1,
            on(eventName, fn, scope) {
                eventName === 'dragEnd' && (releaseDrag = () => fn.call(scope))
            },
            un() {}
        };

        await plugin.project(false);

        expect(measureCalls, 'held geometry performs no new DOM measurement').toBe(beforeDragMeasures);
        expect(plugin.sortDragProjectionQueued).toBe(true);
        expect(plugin.sortDragRecaptureQueued).toBe(false);

        plugin.owner.sortZone.dragEndActive = true;
        plugin.owner.sortZone.startIndex    = -1;
        releaseDrag();

        // A tab mutation arrives in the terminal gap. Its recapture intent must join the already
        // scheduled drain rather than being stranded behind the consumed dragEnd event.
        await plugin.project(true);
        expect(plugin.sortDragRecaptureQueued, 'the terminal-gap recapture remains sticky').toBe(true);

        // Dock post-cleanup can keep the latch beyond the first timer task.
        setTimeout(() => {plugin.owner.sortZone.dragEndActive = false}, 25);
        await new Promise(resolve => setTimeout(resolve, 60));

        expect(measureCalls, 'one projection drains after the terminal').toBeGreaterThan(beforeDragMeasures);
        expect(plugin.sortDragProjectionQueued).toBe(false);
        expect(plugin.sortDragRecaptureQueued).toBe(false);

        plugin.destroy()
    });

    test('an in-flight measurement hands off when a sort snapshot begins before applySplit', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner'
            ? [{height: 300, left: 0, top: 0, width: 1000, x: 0, y: 0}]
            : [{height: 20, width: 20}, {height: 20, width: 20}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        let applyCalls = 0,
            releaseDrag,
            releaseMeasure,
            signalMeasure;

        const measureStarted = new Promise(resolve => {signalMeasure = resolve}),
              measureGate    = new Promise(resolve => {releaseMeasure = resolve});

        plugin.naturalWidths = {b1: 20, b2: 20};
        plugin.applySplit = () => {applyCalls++};
        plugin.owner.sortZone = {
            dragEndActive: false,
            startIndex   : -1,
            on(eventName, fn, scope) {
                eventName === 'dragEnd' && (releaseDrag = () => fn.call(scope))
            },
            un() {}
        };
        plugin.owner.getDomRect = async () => {
            signalMeasure();
            await measureGate;
            return [{height: 300, left: 0, top: 0, width: 1000, x: 0, y: 0}]
        };

        const projection = plugin.project(false);

        await measureStarted;
        plugin.owner.sortZone.startIndex = 1;
        releaseMeasure();
        await projection;

        expect(applyCalls, 'a pre-drag measurement cannot mutate beneath the new snapshot').toBe(0);
        expect(plugin.sortDragProjectionQueued).toBe(true);

        plugin.owner.sortZone.dragEndActive = true;
        plugin.owner.sortZone.startIndex    = -1;
        releaseDrag();
        setTimeout(() => {plugin.owner.sortZone.dragEndActive = false}, 15);
        await new Promise(resolve => setTimeout(resolve, 40));

        expect(applyCalls, 'the handed-off projection drains once after the terminal').toBe(1);

        plugin.destroy()
    });

    test('snapshot preparation waits for an in-flight recapture to restore its final split', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner'
            ? [{height: 25, left: 0, top: 0, width: 1000, x: 0, y: 0}]
            : [{height: 20, width: 50}, {height: 20, width: 50}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        let releaseUpdate,
            signalUpdate;

        const updateStarted = new Promise(resolve => {signalUpdate = resolve}),
              updateGate    = new Promise(resolve => {releaseUpdate = resolve}),
              makeButton    = (id, hidden=false) => ({
                  cls     : [],
                  hidden,
                  id,
                  maxWidth: null,
                  vdom    : hidden ? {removeDom: true} : {},
                  addCls(value) { !this.cls.includes(value) && this.cls.push(value) },
                  removeCls(value) { this.cls = this.cls.filter(item => item !== value) },
                  setSilent(values) { Object.assign(this, values) },
                  show() {
                      this.hidden = false;
                      delete this.vdom.removeDom
                  }
              }),
              buttons = [makeButton('b1'), makeButton('b2', true)];

        plugin.owner.items = buttons;
        plugin.owner.getDomRect = async ids => ids[0] === 'tab-overflow-test-owner'
            ? [{height: 25, left: 0, top: 0, width: 70, x: 0, y: 0}]
            : [{height: 20, width: 50}, {height: 20, width: 50}];
        plugin.owner.promiseUpdate = async () => {
            signalUpdate();
            await updateGate
        };
        plugin.owner.update = () => {};
        plugin.naturalWidths = {b1: 50, b2: 50};
        plugin.syncControl = () => {};

        const recapture = plugin.project(true);

        await updateStarted;
        expect(buttons[1].hidden, 'recapture temporarily restores the hidden tab').toBe(false);

        plugin.owner.sortZone = {
            dragEndActive      : false,
            sortSnapshotPending: true,
            startIndex         : -1,
            on() {},
            un() {}
        };

        const idle = plugin.whenProjectionIdle();

        releaseUpdate();
        await recapture;
        await idle;

        expect(buttons[1].hidden,
            'the restoring split commits before snapshot preparation is released').toBe(true);
        expect(plugin.sortDragProjectionQueued).toBe(false);

        plugin.owner.sortZone.sortSnapshotPending = false;
        plugin.destroy()
    });

    test('destroy releases projection-idle waiters without a dead-owner snapshot callback', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner'
            ? [{height: 300, left: 0, top: 0, width: 1000, x: 0, y: 0}]
            : [{height: 20, width: 20}, {height: 20, width: 20}]);

        await new Promise(resolve => setTimeout(resolve, 0));

        plugin.measuring = true;
        const waiter = plugin.whenProjectionIdle();

        plugin.destroy();
        await waiter;

        expect(plugin.isDestroyed).toBe(true);
        expect(() => plugin.onSortSnapshotReady()).not.toThrow()
    });

    test('re-arm: a transiently unmounted control re-mounts on the next sync — once, latched, aligned after the mount lands (#16434)', async () => {
        // A floating control mounts once at create. A transient unmount (a re-projection wave,
        // a tour reset) previously ratcheted into a permanent wedge: the update branch only
        // mutated menu items on the unmounted instance, and no path ever re-attempted the
        // mount. The re-arm makes the surface self-healing; this pins its full lifecycle.
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0));

        const hiddenMeta = [{text: 'Agents', iconCls: 'fa fa-users', index: 0}];

        let aligned     = 0,
            initCalls   = 0,
            initArg     = null,
            resolveInit = null;

        plugin.control = {
            isDestroyed        : false,
            isVnodeInitializing: false,
            menuList           : {items: []},
            mounted            : false,
            alignTo() {
                aligned++
            },
            initVnode(mount) {
                initCalls++;
                initArg = mount;
                return new Promise(resolve => {
                    resolveInit = resolve
                })
            }
        };

        plugin.syncControl(hiddenMeta, {activeIndex: 0});

        expect(initCalls, 'the unmounted control gets exactly one re-mount attempt').toBe(1);
        expect(initArg, 'the re-attempt is a mounting initVnode').toBe(true);
        expect(plugin.remountArming, 'the latch holds while the attempt is in flight').toBe(true);
        expect(aligned, 'no align before the mount lands').toBe(0);

        // A second sync during the in-flight attempt must not double-arm.
        plugin.syncControl(hiddenMeta, {activeIndex: 0});
        expect(initCalls, 'the latch bounds the re-arm to one in-flight attempt').toBe(1);

        // The mount lands: the chained align fires once, the latch releases.
        plugin.control.mounted = true;
        resolveInit();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(aligned, 'the re-mounted control is re-pinned to the owner edge').toBe(1);
        expect(plugin.remountArming, 'the latch releases after settlement').toBe(false);

        // A mounted control takes the ordinary update path: no re-arm churn, sync-time re-align only.
        plugin.syncControl(hiddenMeta, {activeIndex: 0});
        expect(initCalls, 'a mounted control is never re-armed').toBe(1);
        expect(aligned, 'the ordinary sync-time re-align fires for the mounted control').toBe(2)
    });

    test('re-arm skips a control whose own initVnode is still in flight (#16434)', async () => {
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0));

        let initCalls = 0;

        plugin.control = {
            isDestroyed        : false,
            isVnodeInitializing: true,
            menuList           : {items: []},
            mounted            : false,
            alignTo() {},
            initVnode() {
                initCalls++;
                return Promise.resolve()
            }
        };

        plugin.syncControl([{text: 'Agents', iconCls: 'fa fa-users', index: 0}], {activeIndex: 0});

        expect(initCalls, 'a first mount already in flight is never doubled').toBe(0);
        expect(plugin.remountArming, 'the latch stays untouched').toBe(false)
    });

    test('re-arm vs the REAL producer: a theme-file deferral holds the latch across syncs — no listener stacking (#16434)', async () => {
        // The deferred initVnode branch settles only when the re-entered attempt settles
        // (VdomLifecycle chains through the once-listener). The latch therefore spans the
        // WHOLE deferral: repeated syncs must not register overlapping themeFilesLoaded
        // callbacks. Pre-repair the wrapper resolved early, the latch released, and every
        // sync stacked another listener (reviewer falsifier: registrations 1 → 2).
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0));

        const
            hiddenMeta       = [{text: 'Agents', iconCls: 'fa fa-users', index: 0}],
            worker           = Neo.currentWorker,
            themeCallbacks   = [],
            originalOn       = worker.on,
            originalCount    = worker.countLoadingThemeFiles,
            originalUnitMode = Neo.config.unitTestMode,
            control          = Neo.create({
                module  : (await import('../../../../../src/component/Base.mjs')).default,
                appName : 'test-app',
                floating: true,
                parentId: 'document.body',
                windowId: 1
            });

        worker.on = (event, callback) => {
            (event === 'themeFilesLoaded' || event?.themeFilesLoaded) && themeCallbacks.push(
                typeof event === 'string' ? callback : event.themeFilesLoaded
            )
        };
        worker.countLoadingThemeFiles = 1;

        plugin.control = control;

        try {
            // The gate check reads config synchronously at call time: expose the real
            // (non-unit) branch for exactly the arming calls, restore right after.
            Neo.config.unitTestMode = false;
            plugin.syncControl(hiddenMeta, {activeIndex: 0});

            expect(themeCallbacks.length, 'the first sync arms exactly one deferral listener').toBe(1);
            expect(plugin.remountArming, 'the latch holds across the deferral, not just the call').toBe(true);

            plugin.syncControl(hiddenMeta, {activeIndex: 0});

            expect(themeCallbacks.length, 'a second sync during the deferral stacks NO second listener').toBe(1);
            Neo.config.unitTestMode = originalUnitMode;

            // Theme files land: the deferral re-enters (unit mode early-returns the attempt),
            // the chained promise settles, the latch releases.
            worker.countLoadingThemeFiles = 0;
            themeCallbacks[0]();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(plugin.remountArming, 'the latch releases when the REAL attempt settles').toBe(false)
        } finally {
            Neo.config.unitTestMode = originalUnitMode;
            worker.on = originalOn;
            originalCount === undefined
                ? delete worker.countLoadingThemeFiles
                : worker.countLoadingThemeFiles = originalCount;
            control.destroy()
        }
    });

    test('re-arm vs the REAL producer: a rejected attempt releases isVnodeInitializing so the next sync retries (#16434)', async () => {
        // Pre-repair, a real vnode-creation rejection left isVnodeInitializing=true, so the
        // guard skipped every later sync and the promised retry never ran (reviewer
        // falsifier: create calls 1 → 1). The catch now releases the flag; this drives the
        // REAL initVnode through a rejecting Neo.vdom.Helper.create and proves the retry.
        const plugin = createPlugin(async ids => ids[0] === 'tab-overflow-test-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}]);
        await new Promise(resolve => setTimeout(resolve, 0));

        // The Helper registers Neo.vdom.Helper at import time; this spec's own module graph
        // does not load it otherwise.
        await import('../../../../../src/vdom/Helper.mjs');

        const
            hiddenMeta     = [{text: 'Agents', iconCls: 'fa fa-users', index: 0}],
            originalAllow  = Neo.config.allowVdomUpdatesInTests,
            originalApp    = Neo.apps?.['test-app'],
            originalCreate = Neo.vdom.Helper.create,
            originalError  = console.error,
            control        = Neo.create({
                module  : (await import('../../../../../src/component/Base.mjs')).default,
                appName : 'test-app',
                floating: true,
                parentId: 'document.body',
                windowId: 1
            });

        let createCalls = 0;

        Neo.apps ??= {};
        Neo.apps['test-app'] = {fire: () => {}, mounted: true, vnodeInitialized: true};
        Neo.config.allowVdomUpdatesInTests = true;
        Neo.vdom.Helper.create = () => {
            createCalls++;
            return Promise.reject(new Error('transient vnode-creation failure'))
        };
        console.error = () => {}; // initVnode's catch logs the rejection by contract

        plugin.control = control;

        try {
            plugin.syncControl(hiddenMeta, {activeIndex: 0});
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(createCalls, 'the first sync drives one real create attempt').toBe(1);
            expect(control.isVnodeInitializing, 'the rejection releases the core initializing flag').toBe(false);
            expect(plugin.remountArming, 'the rejection releases the plugin latch').toBe(false);

            plugin.syncControl(hiddenMeta, {activeIndex: 0});
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(createCalls, 'the next sync RETRIES with a second real create attempt').toBe(2);
            expect(control.isVnodeInitializing, 'the retry rejection releases the flag again').toBe(false);
            expect(plugin.remountArming, 'the latch is reusable across failed attempts').toBe(false)
        } finally {
            Neo.config.allowVdomUpdatesInTests = originalAllow;
            Neo.vdom.Helper.create = originalCreate;
            console.error = originalError;
            originalApp === undefined ? delete Neo.apps['test-app'] : Neo.apps['test-app'] = originalApp;
            control.destroy()
        }
    })
});

test.describe('Neo.tab.plugin.Overflow (cap ownership + reservation lifecycle)', () => {
    let Overflow;

    test.beforeAll(async () => {
        Overflow = (await import('../../../../../src/tab/plugin/Overflow.mjs')).default
    });

    const

        settle = () => new Promise(resolve => setTimeout(resolve, 10)),

        /** A tab-button stub carrying the public channels the cap contract touches. */
        makeCapButton = (id, config = {}) => ({
            cls     : [],
            hidden  : false,
            id,
            maxWidth: null,
            style   : {},
            vdom    : {},
            addCls(value) { !this.cls.includes(value) && this.cls.push(value) },
            removeCls(value) { this.cls = this.cls.filter(item => item !== value) },
            setSilent(values) { Object.assign(this, values) },
            show() {
                this.hidden = false;
                delete this.vdom.removeDom
            },
            ...config
        }),

        /** A toolbar-owner stub with the parent seam the active-button resolution needs. */
        createCapPlugin = ({buttons, getDomRect}) => Neo.create(Overflow, {
            owner: {
                id            : 'cap-owner',
                appName       : 'test-app',
                items         : buttons,
                mounted       : true,
                parent        : {activeIndex: 0, on() {}, un() {}},
                theme         : 'neo-theme-neo-dark',
                windowId      : 1,
                dock          : 'top',
                getActionItems: () => [],
                getTabButtons : () => buttons,
                getDomRect,
                getTheme() { return this.theme },
                add            : () => ({}),
                addDomListeners() {},
                on() {},
                un() {},
                remove() {},
                promiseUpdate: async () => {},
                update() {}
            }
        });

    test('render-truth edge: the pass that creates the control converges estimate→rendered at mount, no external event needed', async () => {
        const
            b1         = makeCapButton('b1'),
            b2         = makeCapButton('b2'),
            control    = Neo.create(MountableControl),
            origCreate = Neo.create;

        let createdConfig = null;

        // The projection's create branch must receive a real config-system instance (the mounted
        // observer is the contract under test); spy only the single-object component create.
        Neo.create = (a, b) => a?.module ? (createdConfig = a, control) : origCreate(a, b);

        try {
            const plugin = createCapPlugin({
                buttons   : [b1, b2],
                // extent 236; rendered control 49 — measurable only once mounted. Naturals: the
                // active b1 (227) alone exceeds usable, staging the degenerate cap.
                getDomRect: async ids => ids[0] === 'cap-owner'
                    ? (ids.length === 2 ? [{width: 236}, {width: 49}] : [{width: 236}])
                    : [{width: 227}, {width: 100}]
            });

            await settle();

            // The reviewer-falsified state, now pinned as the INTERMEDIATE contract: the single
            // projection that created the (unmounted) control could only use the estimate…
            expect(createdConfig, 'the projection created the control').toBeTruthy();
            expect(plugin.measuredControlWidth, 'no render truth exists before the mount').toBe(null);
            expect(b1.maxWidth, 'the cap uses the pre-creation estimate').toBe(236 - 40);
            expect(plugin.projectQueued, 'and no external pass is owed').toBe(false);

            // …and the mount itself is the projection edge: no resize, activation, or tab
            // mutation occurs past this line.
            control.mounted = true;
            await settle();

            expect(plugin.measuredControlWidth, 'the mount edge measured the rendered control').toBe(49);
            expect(b1.maxWidth, 'the cap converged to the rendered reservation').toBe(236 - 49);

            plugin.destroy()
        } finally {
            Neo.create = origCreate;
            control.destroy()
        }
    });

    test('a consumer-configured maxWidth is never plugin residue: ordinary and recapture passes leave it untouched', async () => {
        const
            b1     = makeCapButton('b1'),
            b2     = makeCapButton('b2', {maxWidth: 120, style: {color: 'red', maxWidth: '120px'}}),
            plugin = createCapPlugin({
                buttons   : [b1, b2],
                getDomRect: async ids => ids[0] === 'cap-owner' ? [{width: 1000}] : [{width: 100}, {width: 100}]
            });

        await settle();

        expect(b2.maxWidth, 'consumer maxWidth config preserved on the ordinary pass').toBe(120);
        expect(b2.style, 'consumer style object untouched').toEqual({color: 'red', maxWidth: '120px'});
        expect(b2.cls, 'no plugin cap marker').toEqual([]);
        expect(plugin.appliedCaps, 'no ownership recorded for consumer values').toBe(null);

        await plugin.project(true);

        expect(b2.maxWidth, 'recapture does not classify the consumer value as residue').toBe(120);
        expect(b2.style).toEqual({color: 'red', maxWidth: '120px'});

        plugin.destroy()
    });

    test('cap → recapture → no-overflow restores the exact caller value through the public channel', async () => {
        const
            b1         = makeCapButton('b1', {maxWidth: 300}),
            b2         = makeCapButton('b2'),
            control    = Neo.create(MountableControl),
            origCreate = Neo.create;

        let extent = 236;

        Neo.create = (a, b) => a?.module ? control : origCreate(a, b);

        try {
            const plugin = createCapPlugin({
                buttons   : [b1, b2],
                getDomRect: async ids => ids[0] === 'cap-owner'
                    ? (ids.length === 2 ? [{width: extent}, {width: 49}] : [{width: extent}])
                    : [{width: 227}, {width: 100}]
            });

            await settle();

            // Stage 1 — capped: provenance recorded with the caller's own ceiling.
            expect(plugin.appliedCaps?.get('b1'), 'the caller value is recorded at cap time')
                .toEqual({maxSize: 'maxWidth', value: 300});
            expect(b1.maxWidth, 'the cap overrides through the same public channel').toBe(236 - 40);
            expect(b1.cls, 'the cap marker is present').toContain('neo-tab-overflow-capped');

            // Stage 2 — recapture: the lift restores the caller value for measurement, then the
            // split re-caps; the recorded provenance survives un-overwritten.
            await plugin.project(true);

            expect(plugin.appliedCaps?.get('b1'), 'recapture must not re-record the plugin cap as prior')
                .toEqual({maxSize: 'maxWidth', value: 300});
            expect(b1.maxWidth, 'the re-applied cap holds after recapture').toBe(236 - 40);

            // Stage 3 — the overflow retires: the exact caller value returns.
            extent = 1000;
            await plugin.project(false);

            expect(b1.maxWidth, 'the exact caller value is restored').toBe(300);
            expect(b1.cls, 'the cap marker is removed').toEqual([]);
            expect(plugin.appliedCaps?.size ?? 0, 'the ledger empties').toBe(0);

            plugin.destroy()
        } finally {
            Neo.create = origCreate;
            control.destroy()
        }
    })

    test('a dock-axis change retires the old cap before owning the new max-size channel', async () => {
        const
            b1     = makeCapButton('b1', {maxHeight: 250, maxWidth: 300}),
            plugin = createCapPlugin({
                buttons   : [b1],
                getDomRect: async () => [{height: 1000, width: 1000}]
            });

        await settle();

        plugin.naturalWidths = {b1: 500};
        plugin.applySplit([], [b1], plugin.owner.parent, {
            activeButton: b1,
            maxSize     : 'maxWidth',
            usable      : 196
        });

        expect(b1.maxWidth).toBe(196);
        expect(plugin.appliedCaps.get('b1')).toEqual({maxSize: 'maxWidth', value: 300});

        plugin.applySplit([], [b1], plugin.owner.parent, {
            activeButton: b1,
            maxSize     : 'maxHeight',
            usable      : 180
        });

        expect(b1.maxWidth, 'the retired horizontal channel returns to the caller').toBe(300);
        expect(b1.maxHeight).toBe(180);
        expect(plugin.appliedCaps.get('b1')).toEqual({maxSize: 'maxHeight', value: 250});

        plugin.applySplit([], [b1], plugin.owner.parent, {
            activeButton: b1,
            maxSize     : 'maxHeight',
            usable      : null
        });

        expect(b1.maxHeight, 'clearing restores the new-axis caller value').toBe(250);
        expect(plugin.appliedCaps.size).toBe(0);

        plugin.destroy()
    })
});

test.describe('Neo.tab.plugin.Overflow.computeOverflow — the pure overflow core (projection concern, zero model state)', () => {
    let Overflow;

    test.beforeAll(async () => {
        Overflow = (await import('../../../../../src/tab/plugin/Overflow.mjs')).default
    });

    const items = widths => Object.entries(widths).map(([id, headerWidth]) => ({id, headerWidth}));

    test('everything fits: empty hidden set, control width NOT reserved', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'a',
            controlWidth: 40,
            extent      : 300,
            items       : items({a: 100, b: 100, c: 100})
        });

        // Σwidths === extent exactly — the control must not push anything out
        expect(result).toEqual({hidden: [], visible: ['a', 'b', 'c']})
    });

    test('overflow: control width reserved, in-order packing, remainder hidden in items order', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'a',
            controlWidth: 40,
            extent      : 300,
            items       : items({a: 100, b: 100, c: 100, d: 100})
        });

        // usable = 260 → a + b fit, c and d overflow in order
        expect(result).toEqual({hidden: ['c', 'd'], visible: ['a', 'b']})
    });

    test('the ACTIVE item is never hidden: it swaps in, the last-fitting non-active item overflows', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'd',
            controlWidth: 40,
            extent      : 300,
            items       : items({a: 100, b: 100, c: 100, d: 100})
        });

        expect(result.visible).toEqual(['a', 'd']);
        // hidden preserves items order (b before c) — menus list predictably
        expect(result.hidden).toEqual(['b', 'c'])
    });

    test('active WIDER than the displaced tab: displace as many trailing tabs as it takes — the active never spills', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'd',
            controlWidth: 0,
            extent      : 100,
            items       : items({a: 30, b: 30, c: 30, d: 50})
        });

        // a+b+c (90) fit; d (active, 50) overflows. Surfacing d needs 50px: displacing only c (30) leaves
        // a+b+d = 110 > 100 — the under-displacement bug. BOTH b and c must overflow so a+d = 80 fits
        // within the 100 extent.
        expect(result.visible).toEqual(['a', 'd']);
        expect(result.hidden).toEqual(['b', 'c'])
    });

    test('degenerate: a single item wider than the extent stays visible — you cannot hide the only tab', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'a',
            controlWidth: 40,
            extent      : 80,
            items       : items({a: 500})
        });

        expect(result).toEqual({hidden: [], visible: ['a']})
    });

    test('active-only survivor: nothing fits, the active tab is force-kept and everything else overflows in order', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'c',
            controlWidth: 60,
            extent      : 50,
            items       : items({a: 100, b: 100, c: 100})
        });

        expect(result.visible).toEqual(['c']);
        expect(result.hidden).toEqual(['a', 'b'])
    });

    test('fail-soft measurements: non-finite/negative widths pack as zero, never crash a projection pass', () => {
        const result = Overflow.computeOverflow({
            activeItemId: 'a',
            controlWidth: 40,
            extent      : 100,
            items       : [{id: 'a', headerWidth: 60}, {id: 'b', headerWidth: NaN}, {id: 'c', headerWidth: -5}, {id: 'd', headerWidth: 80}]
        });

        // total = 140 > 100 → overflow path; usable = 60 → a fits; b and c pack as zero-width
        // (fail-SOFT is fail-VISIBLE — an unmeasured tab stays reachable and the next
        // measurement pass corrects); d (80) is the first real non-fit and overflows
        expect(result.visible).toEqual(['a', 'b', 'c']);
        expect(result.hidden).toEqual(['d'])
    });
});

test.describe('Neo.tab.plugin.Overflow (tab-set mutation invalidation)', () => {
    let Overflow;

    test.beforeAll(async () => {
        Overflow = (await import('../../../../../src/tab/plugin/Overflow.mjs')).default
    });

    // A minimal event bus so firing 'insert' (owner) / 'moveTo' (tab.Container = owner.parent) exercises the
    // real onOwnerMounted wiring, not a stubbed no-op. A wide extent keeps nothing overflowing so the pass
    // settles cleanly; the point is only that a tab-set mutation re-runs a project pass without a resize or
    // activation — the stranding the plugin's cache would otherwise suffer.
    const createWiredPlugin = () => {
        const mkBus = () => {
            const map = {};
            return {
                on  : (evt, fn, scope) => { (map[evt] || (map[evt] = [])).push(scope ? fn.bind(scope) : fn) },
                un  : () => {},
                fire: (evt, data) => { (map[evt] || []).forEach(fn => fn(data)) }
            }
        };

        const parent = Object.assign({activeIndex: 0}, mkBus()),
              plugin = Neo.create(Overflow, {
                  owner: Object.assign({
                      id             : 'wired-owner',
                      appName        : 'test-app',
                      mounted        : true,
                      theme          : 'neo-theme-neo-dark',
                      windowId       : 1,
                      items          : [{id: 'b1'}, {id: 'b2'}],
                      parent,
                      getTheme       : function () { return this.theme },
                      getDomRect     : async ids => ids[0] === 'wired-owner' ? [{width: 1000}] : [{width: 10}, {width: 10}],
                      add            : () => ({}),
                      addDomListeners: () => {},
                      remove         : () => {},
                      up             : () => parent
                  }, mkBus())
              });

        plugin.control = null;

        return {plugin, owner: plugin.owner, parent}
    };

    test('a tab add (owner `insert`) re-runs a RECAPTURE project pass so the added tab gets measured', async () => {
        const {plugin, owner} = createWiredPlugin();
        await new Promise(resolve => setTimeout(resolve, 0)); // settle the mount project(true)

        let   recapture = null;
        const orig      = plugin.project.bind(plugin);
        plugin.project = arg => { recapture = arg; return orig(arg) };

        owner.fire('insert', {index: 2, item: {id: 'b3'}});

        // An added tab has no cached natural width, so the pass must recapture (project(true)).
        expect(recapture, 'owner `insert` re-runs project(true)').toBe(true)
    });

    test('a tab reorder (tab.Container `moveTo`) re-runs a project pass so the split follows the new order', async () => {
        const {plugin, parent} = createWiredPlugin();
        await new Promise(resolve => setTimeout(resolve, 0));

        let   projected = false;
        const orig      = plugin.project.bind(plugin);
        plugin.project = arg => { projected = true; return orig(arg) };

        parent.fire('moveTo', {fromIndex: 0, toIndex: 1});

        expect(projected, 'tab.Container `moveTo` re-runs project so the reordered split stays live').toBe(true)
    });

    test('a tab removal (owner `remove`) re-runs a project pass so stale menu indices are dropped', async () => {
        const {plugin, owner} = createWiredPlugin();
        await new Promise(resolve => setTimeout(resolve, 0));

        let   projected = false;
        const orig      = plugin.project.bind(plugin);
        plugin.project = arg => { projected = true; return orig(arg) };

        owner.fire('remove', {index: 1, item: {id: 'b2'}});

        expect(projected, 'owner `remove` re-runs project so a removed tab drops from the split + menu').toBe(true)
    });

    // The owner's `insert` / `remove` also carry its ACTION group — a consumer `actions`
    // replacement moves through the same container methods as a tab add. Recapturing on those restores
    // every hidden header to DOM for the measure window, and `insert` fires only AFTER its own
    // promiseUpdate round-trip, so the pass lands late and re-applies an all-fit split over a newer
    // resize's split. `actionsChange` already covers the real (extent-only) effect without a recapture.
    test('an action-group `insert` does NOT recapture — it is an extent change, not a tab-set mutation', async () => {
        const {plugin, owner} = createWiredPlugin();
        await new Promise(resolve => setTimeout(resolve, 0));

        let   projected = false;
        const orig      = plugin.project.bind(plugin);
        plugin.project = arg => { projected = true; return orig(arg) };

        owner.fire('insert', {index: 2, item: {id: 'neo-button-9', isToolbarAction: true}});

        expect(projected, 'a single action insert must not re-run project').toBe(false);

        // The extent DID change, and the action-set channel is what must carry it.
        owner.fire('actionsChange', {actions: []});
        expect(projected, '`actionsChange` still re-projects the tab-exclusive extent').toBe(true)
    });

    test('a BATCHED action insert does not recapture — `Container#insert` fires once with the whole array', async () => {
        const {plugin, owner} = createWiredPlugin();
        await new Promise(resolve => setTimeout(resolve, 0));

        let   projected = false;
        const orig      = plugin.project.bind(plugin);
        plugin.project = arg => { projected = true; return orig(arg) };

        // The shape `syncActions` actually produces: the per-item recursion is silent, so the single
        // fired event carries an ARRAY. A membership test written for one instance misses this entirely.
        owner.fire('insert', {index: 2, item: [
            {id: 'neo-component-4', isToolbarActionSpacer: true},
            {id: 'neo-button-9',    isToolbarAction      : true},
            {id: 'neo-button-10',   isToolbarAction      : true}
        ]});

        expect(projected, 'a batched action insert must not re-run project').toBe(false)
    });

    test('a MIXED batch still recaptures — only an all-action batch is exempt', async () => {
        const {plugin, owner} = createWiredPlugin();
        await new Promise(resolve => setTimeout(resolve, 0));

        let   recapture = null;
        const orig      = plugin.project.bind(plugin);
        plugin.project = arg => { recapture = arg; return orig(arg) };

        owner.fire('insert', {index: 2, item: [{id: 'neo-button-9', isToolbarAction: true}, {id: 'b3'}]});

        expect(recapture, 'a batch containing a real tab still recaptures').toBe(true)
    })
});
