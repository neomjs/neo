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
        // The plugin owns computeTabOverflow as its own static — no adapter import needed (the adapter chain
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
                windowId       : 1,
                items          : [{id: 'b1'}, {id: 'b2'}],
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
        let   created    = false;
        Neo.create = () => { created = true; return {ntype: 'button', destroy: () => {}} };
        try {
            plugin.syncControl([{text: 'Agents', iconCls: 'fa fa-users', index: 0}], {activeIndex: 0})
        } finally {
            Neo.create = origCreate
        }

        expect(created, 'a subsequent overflow builds a fresh control via Neo.create').toBe(true);
        expect(plugin.control, 'and assigns the fresh instance as the new control').not.toBeNull()
    })
});
