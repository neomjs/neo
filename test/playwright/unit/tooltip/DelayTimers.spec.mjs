import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: 'TooltipDelayTimersTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
// the spec stands in for the thread entrypoint, which imports the instance manager Neo.get resolves through
import                     '../../../../src/manager/Instance.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';

/**
 * @summary The tooltip's delay timers through the class's own methods, on a prototype host whose own data
 * properties shadow the reactive configs: a mount records a show, an unmount a hide. Real timers at short
 * delays, so a pending timer fires exactly as it would under a pointer.
 * @returns {{host: Object, shows: Number[]}}
 */
function makeHost() {
    const host = Object.create(Tooltip.prototype), shows = [];

    Object.entries({
        activeTarget      : null,
        align             : {},
        dismissDelay      : null,
        dismissDelayTaskId: null,
        fire              : () => {},
        hideDelay         : 40,
        hideDelayTaskId   : null,
        initVnode         : () => { host.mounted = true; shows.push(Date.now()) },
        mounted           : false,
        showDelay         : 20,
        showDelayTaskId   : null,
        unmount           : () => { host.mounted = false }
    }).forEach(([key, value]) => Object.defineProperty(host, key, {configurable: true, enumerable: true, value, writable: true}));

    return {host, shows}
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test.describe('Neo.tooltip.Base — the show and hide delays', () => {
    test('a target left inside the show delay never shows the tooltip', async () => {
        const {host, shows} = makeHost();

        host.onDelegateMouseEnter({currentTarget: 'target-1'});
        // Neo.get answers the hovered component; the host has none registered
        host.activeTarget = {id: 'target-1'};
        host.onDelegateMouseLeave({currentTarget: 'target-1'});

        await wait(120);

        expect(shows, 'the pending show was cancelled by the leave').toHaveLength(0);
        expect(host.mounted).toBe(false)
    });

    test('a target held past the show delay shows the tooltip, and leaving hides it after the hide delay', async () => {
        const {host, shows} = makeHost();

        host.onDelegateMouseEnter({currentTarget: 'target-1'});
        host.activeTarget = {id: 'target-1'};

        await wait(60);
        expect(shows).toHaveLength(1);

        host.onDelegateMouseLeave({currentTarget: 'target-1'});
        expect(host.mounted, 'the hide waits its delay').toBe(true);

        await wait(100);
        expect(host.mounted).toBe(false)
    });

    test('a delay armed twice keeps one timer: an instant hide cancels it, and nothing shows later', async () => {
        const {host, shows} = makeHost();

        host.showDelayed({});
        host.showDelayed({});
        host.hide();

        await wait(120);

        expect(shows).toHaveLength(0)
    });
});
