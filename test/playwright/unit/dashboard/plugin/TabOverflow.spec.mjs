import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardTabOverflowPluginTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * @summary Focused tests for the Neo.dashboard.plugin.TabOverflow re-entrancy contract — the part of
 * the runtime overflow plugin that must survive a resize / activation storm without stranding state.
 *
 * These pin the two failure modes a naked latch produced: a thrown measure freezing every future pass,
 * and a concurrent pass being silently dropped (leaving a stale split). The full measure/apply path is
 * exercised by the example + e2e; here the owner is a lean stub so the guard logic is isolated.
 */
test.describe('Neo.dashboard.plugin.TabOverflow (re-entrancy contract)', () => {
    let TabOverflow;

    test.beforeAll(async () => {
        // DockLayoutAdapter provides computeTabOverflow via the Neo namespace (the plugin does not import it)
        await import('../../../../../src/dashboard/DockLayoutAdapter.mjs');
        TabOverflow = (await import('../../../../../src/dashboard/plugin/TabOverflow.mjs')).default
    });

    /** A lean toolbar-owner stub: two header buttons, a controllable getDomRect. */
    const createPlugin = getDomRect => {
        const plugin = Neo.create(TabOverflow, {
            owner: {
                id             : 'tab-overflow-test-owner',
                mounted        : true,
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
    })
});
