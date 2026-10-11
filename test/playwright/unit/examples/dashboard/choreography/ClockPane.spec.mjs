import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoClockPaneTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import ClockPane      from '../../../../../../examples/dashboard/choreography/ClockPane.mjs';

const LIVE_TIME = /^\d{2}:\d{2}:\d{2}$/;

/**
 * @summary The freeze/thaw contract witness for the clock's determinism seam.
 *
 * Pins the two guarantees the visual harness leans on: (1) a `frozenTime` config write is
 * NEVER a lifecycle event — no phantom `mounted` fires, no mount machinery re-enters
 * (the cycle-5 falsified defect: the setter used to call `afterSetMounted` as a helper);
 * (2) the value domain is exact — ANY string freezes to itself (the empty string
 * included), ONLY `null` thaws back to live wall time.
 */
test.describe('Neo.examples.dashboard.choreography.ClockPane — the freeze/thaw seam', () => {
    let pane;

    test.afterEach(() => {
        pane?.destroy();
        pane = null
    });

    test('a freeze/thaw write is a clock change, never a lifecycle event', () => {
        pane = Neo.create(ClockPane, {});

        let mountedEvents = 0;

        pane.on('mounted', () => mountedEvents++);
        pane.mounted = true;

        const eventsAfterMount = mountedEvents;

        expect(pane.vdom.cn[1].html).toMatch(LIVE_TIME);

        pane.frozenTime = '10:00:00';
        expect(pane.vdom.cn[1].html).toBe('10:00:00');

        pane.frozenTime = null;
        expect(pane.vdom.cn[1].html).toMatch(LIVE_TIME);

        // the falsified defect: the old helper-call re-entered the mount lifecycle and
        // re-fired `mounted` on every freeze/thaw — the seam must be lifecycle-silent
        expect(mountedEvents, 'no phantom mounted event across freeze + thaw').toBe(eventsAfterMount)
    });

    test('any string freezes to exactly itself; only null thaws', () => {
        pane = Neo.create(ClockPane, {});
        pane.mounted = true;

        pane.frozenTime = '10:00:00';
        pane.updateTime();
        expect(pane.vdom.cn[1].html, 'a frozen pane re-renders its constant, even through updateTime').toBe('10:00:00');

        // the domain pin: the EMPTY string is a valid frozen value, not a thaw —
        // the check is nullish by contract, never truthy
        pane.frozenTime = '';
        expect(pane.vdom.cn[1].html).toBe('');

        pane.frozenTime = null;
        expect(pane.vdom.cn[1].html).toMatch(LIVE_TIME)
    });

    test('a pane created frozen never starts its tick, and destroy stays idempotent', () => {
        pane = Neo.create(ClockPane, {frozenTime: '10:00:00'});
        pane.mounted = true;

        expect(pane.vdom.cn[1].html).toBe('10:00:00');

        pane.destroy();
        const again = () => pane.destroy();

        expect(again).not.toThrow();
        pane = null
    })
});
