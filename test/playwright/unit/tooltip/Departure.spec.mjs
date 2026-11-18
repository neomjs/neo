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

    test('an explicit hideDelay of 0 hides at once, with no retarget window', async () => {
        const {host: unset} = makeHost(),
              {host}        = makeHost({hideDelay: 0, stayOnHover: false});

        await showOn(unset, 'target-1');
        unset.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});
        expect(unset.hideDelayTaskId, 'control: an unset hideDelay waits the retarget window').not.toBe(null);

        await showOn(host, 'target-2');
        host.onDelegateMouseLeave({currentTarget: 'target-2', relatedTarget: {id: host.id}});

        expect(host.hideDelayTaskId, 'no timer').toBe(null);
        expect(host.mounted, 'hidden within the departure').toBe(false)
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
    });

    test('a departure while the insert is held cancels the show, which lands hidden and leaves the window cold', async () => {
        const {host: first}                      = makeHost({windowId: 'held-window'}),
              {host: second, shows: secondShows} = makeHost({windowId: 'held-window', showDelay: 80});
        let release;

        first.initVnode = () => new Promise(resolve => {release = () => {first.mounted = true; resolve()}});
        first.onDelegateMouseEnter({currentTarget: 'target-1'});
        first.activeTarget = {id: 'target-1'};
        await expect.poll(() => typeof release, 'control: the show started its insert').toBe('function');

        first.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});
        expect(first._hidden, 'the departure before the paint cancels the show at once').toBe(true);

        release();
        await wait(10);
        expect(first.mounted, 'the held insert lands hidden').toBe(false);

        let entered = Date.now();

        await showOn(second, 'target-2');
        expect(secondShows[0] - entered, 'a show that never painted does not warm the window').toBeGreaterThanOrEqual(70)
    });

    test('the next tooltip of a window enters the DOM only once the previous one has left it', async () => {
        const {host: first}                      = makeHost({windowId: 'serial-window'}),
              {host: second, shows: secondShows} = makeHost({windowId: 'serial-window'});
        let releaseRemoval;

        await showOn(first, 'target-1');
        first.unmount = () => new Promise(resolve => {releaseRemoval = () => {first.mounted = false; resolve()}});

        // The first one is painted, so the window is warm and the second shows at once
        second.onDelegateMouseEnter({currentTarget: 'target-2'});
        second.activeTarget = {id: 'target-2'};
        await wait(40);
        expect(secondShows, 'not while the first is still in the DOM').toHaveLength(0);

        releaseRemoval();
        await expect.poll(() => second.mounted).toBe(true)
    });

    test('an insert of the previous tooltip still in flight lands, and leaves, before the next one enters', async () => {
        const {host: first}  = makeHost({windowId: 'flight-window'}),
              {host: second} = makeHost({windowId: 'flight-window'}),
              log            = [];
        let release;

        first.initVnode  = () => new Promise(resolve => {release = () => {first.mounted = true; log.push('first in'); resolve()}});
        first.unmount    = () => {first.mounted = false; log.push('first out')};
        second.initVnode = async () => {second.mounted = true; log.push('second in')};

        first.onDelegateMouseEnter({currentTarget: 'target-1'});
        first.activeTarget = {id: 'target-1'};
        await expect.poll(() => typeof release).toBe('function');

        second.show();
        await wait(20);
        expect(log, 'the second waits for the first insert').toEqual([]);

        release();
        await expect.poll(() => log).toEqual(['first in', 'first out', 'second in'])
    });

    test('a tooltip its target left while its insert is held keeps the next one out of the DOM until it left', async () => {
        const {host: first}  = makeHost({windowId: 'departed-flight-window'}),
              {host: second} = makeHost({windowId: 'departed-flight-window', showDelay: 0});
        let release;

        first.initVnode = () => new Promise(resolve => {release = () => {first.mounted = true; resolve()}});
        first.onDelegateMouseEnter({currentTarget: 'target-1'});
        first.activeTarget = {id: 'target-1'};
        await expect.poll(() => typeof release, 'control: the show started its insert').toBe('function');

        // The departure retires the first one before the second target is entered
        first.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});
        second.onDelegateMouseEnter({currentTarget: 'target-2'});
        await wait(40);
        expect(second.mounted, 'not while the first one\'s insert is on its way').toBe(false);

        release();
        await expect.poll(() => second.mounted).toBe(true);
        expect(first.mounted, 'the first one landed hidden and left').toBe(false)
    });

    test('a tooltip its target left while its removal is held keeps the next one out of the DOM until it left', async () => {
        const {host: first}  = makeHost({windowId: 'departed-removal-window'}),
              {host: second} = makeHost({windowId: 'departed-removal-window', showDelay: 0});
        let releaseRemoval;

        await showOn(first, 'target-1');
        first.unmount = () => {first.mounted = false; return new Promise(resolve => {releaseRemoval = resolve})};

        first.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: 'page'}});
        await expect.poll(() => typeof releaseRemoval, 'control: the departure started the removal').toBe('function');

        second.onDelegateMouseEnter({currentTarget: 'target-2'});
        await wait(40);
        expect(second.mounted, 'not while the first one is still in the DOM').toBe(false);

        releaseRemoval();
        await expect.poll(() => second.mounted).toBe(true)
    });

    test('a shared tooltip a target turns off stay-on-hover lets a move onto it dismiss it', async () => {
        const {host} = makeHost({stayOnHover: false});

        await showOn(host, 'target-1');
        host.onDelegateMouseLeave({currentTarget: 'target-1', relatedTarget: {id: host.id}});
        // The listener a hoverable target added stays on the shared tooltip
        host.onMouseEnter({path: [{id: host.id}]});

        await expect.poll(() => host.mounted, {timeout: 150}).toBe(false)
    })
});
