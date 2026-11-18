import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: 'TooltipDepartureTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
// the spec stands in for the thread entrypoint, which imports the instance manager Neo.get resolves through
import                     '../../../../src/manager/Instance.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';

let hosts = 0;

/**
 * @summary A tooltip as a prototype host whose own data properties shadow the reactive configs, as in
 * `DelayTimers.spec.mjs`: a mount records a show, an unmount a hide. `hideDelay` and `retargetWindow` stay the class
 * defaults, and each host lives in a window of its own unless it names one.
 * @param {Object} [config={}] Own properties to add or override
 * @returns {{host: Object, shows: Number[]}}
 */
function makeHost(config = {}) {
    const host = Object.create(Tooltip.prototype),
          id   = `tip-${++hosts}`,
          shows = [];

    Object.entries({
        _hidden           : true,
        activeTarget      : null,
        align             : {},
        alignTo           : () => {},
        dismissDelay      : null,
        dismissDelayTaskId: null,
        fire              : () => {},
        hideDelayTaskId   : null,
        id,
        initVnode         : async () => { host.mounted = true; shows.push(Date.now()) },
        isDestroyed       : false,
        mounted           : false,
        mountFlight       : null,
        showDelay         : 20,
        showDelayTaskId   : null,
        stayOnHover       : true,
        unmount           : () => { host.mounted = false },
        vdom              : {id, cn: [{id: `${id}__label`}]},
        warmWindow        : 60,
        windowId          : `window-${hosts}`,
        ...config
    }).forEach(([key, value]) => Object.defineProperty(host, key, {configurable: true, enumerable: true, value, writable: true}));

    return {host, shows}
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Hovers a target until its tooltip is mounted
 * @param {Object} host
 * @param {String} target
 */
async function showOn(host, target) {
    host.onDelegateMouseEnter({currentTarget: target});
    // Neo.get answers the hovered component; the host has none registered
    host.activeTarget = {id: target};
    await expect.poll(() => host.mounted).toBe(true)
}

test.describe('Neo.tooltip.Base — where the pointer goes decides when a tooltip hides', () => {
    test('a target left for the page hides its tooltip within the retarget window', async () => {
        const {host} = makeHost();

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});

        await expect.poll(() => host.mounted, {message: 'no hide delay by default', timeout: 150}).toBe(false)
    });

    test('a target left for another of its targets retargets the shown tooltip without mounting it again', async () => {
        const {host, shows} = makeHost();

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'target-2'}});
        host.onDelegateMouseEnter({currentTarget: 'target-2'});
        host.activeTarget = {id: 'target-2'};

        await wait(100);

        expect(host.mounted, 'past the retarget window').toBe(true);
        expect(host.align.target).toBe('target-2');
        expect(shows, 'one mount').toHaveLength(1)
    });

    test('a target left for its hoverable tooltip keeps it, and the tooltip left for the page hides it', async () => {
        const {host} = makeHost();

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: host.id}});
        await wait(100);
        expect(host.mounted, 'onto the hit area that spans the gap').toBe(true);

        host.onMouseLeave({path: [{id: host.id}], relatedTarget: {id: 'page'}});
        await expect.poll(() => host.mounted, {timeout: 150}).toBe(false)
    });

    test('the tooltip left for its target or a node inside the tooltip stays', async () => {
        const {host} = makeHost();

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: `${host.id}__label`}});
        await wait(100);
        expect(host.mounted, 'onto a node inside the tooltip').toBe(true);

        host.onMouseLeave({path: [{id: host.id}], relatedTarget: {id: 'target-1'}});
        await wait(100);
        expect(host.mounted, 'back onto its target, whose enter shows it again').toBe(true)
    });

    test('a tooltip that does not stay on hover hides when the pointer moves onto it', async () => {
        const {host} = makeHost({stayOnHover: false});

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: host.id}});

        await expect.poll(() => host.mounted, {timeout: 150}).toBe(false)
    });

    test('an explicit hideDelay still delays a departure, past the retarget window', async () => {
        const {host} = makeHost({hideDelay: 200});

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});

        await wait(100);
        expect(host.mounted, 'the hide waits its delay').toBe(true);

        await expect.poll(() => host.mounted).toBe(false)
    });
});

test.describe('Neo.tooltip.Base — one visible tooltip per window, and a warm switch', () => {
    test('showing a tooltip hides the one its window shows, and leaves another window\'s', async () => {
        const {host: first}  = makeHost({windowId: 'shared-window'}),
              {host: second} = makeHost({windowId: 'shared-window'}),
              {host: other}  = makeHost();

        await showOn(first, 'target-1');
        await showOn(other, 'target-3');
        await showOn(second, 'target-2');

        expect(first.mounted, 'the window\'s earlier tooltip').toBe(false);
        expect(second.mounted).toBe(true);
        expect(other.mounted, 'another window\'s').toBe(true)
    });

    test('right after a tooltip hides, the next target of its window shows without the show delay', async () => {
        const {host: first, shows: firstShows}   = makeHost({windowId: 'warm-window'}),
              {host: second, shows: secondShows} = makeHost({windowId: 'warm-window', showDelay: 500});

        await showOn(first, 'target-1');
        first.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});

        let left = Date.now();

        await showOn(second, 'target-2');
        expect(secondShows[0] - left, 'well inside its 500ms show delay').toBeLessThan(100);
        expect(firstShows).toHaveLength(1)
    });

    test('once the warm window passed, a target waits its show delay again', async () => {
        const {host: first}                      = makeHost({windowId: 'cool-window'}),
              {host: second, shows: secondShows} = makeHost({windowId: 'cool-window', showDelay: 80});

        await showOn(first, 'target-1');
        first.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});

        // the hide lands after the retarget window, then the 60ms warm window runs out
        await wait(160);

        let entered = Date.now();

        await showOn(second, 'target-2');
        expect(secondShows[0] - entered).toBeGreaterThanOrEqual(70)
    });

    test('a target left before its tooltip ever showed does not warm the window', async () => {
        const {host: first}                      = makeHost({windowId: 'unwarmed-window'}),
              {host: second, shows: secondShows} = makeHost({windowId: 'unwarmed-window', showDelay: 80});

        first.onDelegateMouseEnter({currentTarget: 'target-1'});
        first.activeTarget = {id: 'target-1'};
        first.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});

        let entered = Date.now();

        await showOn(second, 'target-2');
        expect(secondShows[0] - entered).toBeGreaterThanOrEqual(70)
    })
});
