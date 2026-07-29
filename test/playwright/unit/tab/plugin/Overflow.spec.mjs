import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoTabOverflowPluginTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

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

    /** A lean toolbar-owner stub: two header buttons, a controllable getDomRect. */
    const createPlugin = getDomRect => {
        const plugin = Neo.create(Overflow, {
            owner: {
                id             : 'tab-overflow-test-owner',
                appName        : 'test-app',
                mounted        : true,
                theme          : 'neo-theme-neo-dark',
                windowId       : 1,
                items          : [{id: 'b1'}, {id: 'b2'}],
                getTheme       : function () { return this.theme },
                getDomRect,
                add            : () => ({}),
                addDomListeners: () => {},
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
        // A wide extent (button-id calls → per-button rects; the no-arg extent call → one wide rect)
        // keeps nothing overflowing, so the pass completes cleanly through applySplit.
        const plugin = createPlugin(async ids => {
            callCount++;
            if (callCount === 1) { await gate }
            return ids ? [{width: 10}, {width: 10}] : {width: 1000}
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
            plugin  = createPlugin(async ids => ids ? [{width: 10}, {width: 10}] : {width: 1000});

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
        const plugin = createPlugin(async ids => ids ? [{width: 10}, {width: 10}] : {width: 1000});
        await new Promise(resolve => setTimeout(resolve, 0));

        let destroyed = false;
        plugin.control = {destroy: () => { destroyed = true }};

        plugin.syncControl([], {activeIndex: 0}); // empty hiddenMeta → nothing overflows → teardown

        expect(destroyed, 'the control is destroyed when the overflow set empties').toBe(true);
        expect(plugin.control, 'the reference is cleared, so the next overflow builds a fresh control').toBe(null)
    });

    test('an owner theme change is carried onto the live out-of-tree control', async () => {
        const plugin = createPlugin(async ids => ids ? [{width: 10}, {width: 10}] : {width: 1000});
        await new Promise(resolve => setTimeout(resolve, 0));

        plugin.control = {theme: 'neo-theme-neo-dark'};
        plugin.owner.theme = 'neo-theme-neo-light';
        plugin.onOwnerThemeChange();

        expect(plugin.control.theme, 'the floating control follows the source toolbar theme')
            .toBe('neo-theme-neo-light')
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
            return ids ? [{width: 10}, {width: 10}] : {width: 1000}
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
        const plugin = createPlugin(async ids => ids ? [{width: 10}, {width: 10}] : {width: 1000});
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
        expect(plugin.control, 'and assigns the fresh instance as the new control').not.toBeNull()
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
                      getDomRect     : async ids => ids ? [{width: 10}, {width: 10}] : {width: 1000},
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
    })
});
