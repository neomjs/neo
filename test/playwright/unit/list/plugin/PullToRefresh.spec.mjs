import {setup} from '../../../setup.mjs';

const appName = 'ListPullToRefreshTest';

setup({appConfig: {name: appName}, neoConfig: {unitTestMode: true}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import List           from '../../../../../src/list/Base.mjs';
import PullToRefresh  from '../../../../../src/list/plugin/PullToRefresh.mjs';

let list, plugin;

/** @summary A sample from a single admitted touch pan. */
const pull = (deltaY, overrides={}) => ({
    contacts   : [{id: 0}],
    deltaX     : 0,
    deltaY,
    gestureId  : 7,
    pointerType: 'touch',
    ...overrides
});

test.beforeEach(() => {
    list = Neo.create(List, {appName, plugins: [{module: PullToRefresh}]});
    plugin = list.getPlugin('plugin-list-pull-to-refresh')
});

test.afterEach(() => {
    list.isDestroyed || list.destroy()
});

test('a qualifying release keeps the indicator until refresh work settles, and ignores a second pull', async () => {
    let   count = 0, release;
    const work  = new Promise(resolve => {release = resolve});

    list.on('refresh', ({waitUntil}) => {
        count++;
        waitUntil(work)
    });

    plugin.onPanStart(pull(15));
    expect(plugin.distance).toBe(15);
    plugin.onPanMove(pull(75));
    expect(plugin.distance).toBe(64);
    expect(count).toBe(0);
    plugin.onPanEnd(pull(75, {contacts: []}));
    expect(count).toBe(1);
    expect(plugin.refreshing).toBe(true);
    expect(plugin.distance).toBe(64);

    plugin.onPanStart(pull(35, {gestureId: 8}));
    plugin.onPanEnd(pull(100, {gestureId: 8, contacts: []}));
    expect(await plugin.refresh()).toBe(false);
    expect(count).toBe(1);
    expect(plugin.distance).toBe(64);

    release();
    await expect.poll(() => plugin.refreshing).toBe(false);
    expect(plugin.distance).toBe(0)
});

test('short pulls, cancelled pulls, and joined contacts clear the preview without refreshing', () => {
    let count = 0;
    list.on('refresh', () => count++);

    plugin.onPanStart(pull(12));
    plugin.onPanEnd(pull(35, {contacts: []}));
    expect(plugin.distance).toBe(0);

    plugin.onPanStart(pull(12));
    plugin.onPanMove(pull(90));
    plugin.onPanCancel(pull(90, {contacts: []}));
    expect(plugin.distance).toBe(0);

    plugin.onPanStart(pull(12));
    plugin.onPanMove(pull(90, {contacts: [{id: 0}, {id: 1}]}));
    plugin.onPanEnd(pull(90, {contacts: []}));
    expect(plugin.distance).toBe(0);
    expect(count).toBe(0)
});

test('the direct command clears the indicator on rejection and releases the live owner on teardown', async () => {
    list.on('refresh', ({waitUntil}) => waitUntil(Promise.reject(new Error('offline'))));

    expect(await plugin.refresh()).toBe(false);
    expect(plugin.refreshing).toBe(false);
    expect(plugin.distance).toBe(0);
    expect(list.cls).toContain('neo-list-pull-to-refresh');
    expect(list.domListeners.some(listener => Object.hasOwn(listener, 'pan:start'))).toBe(true);

    plugin.destroy();
    expect(list.cls).not.toContain('neo-list-pull-to-refresh');
    expect(list.domListeners.some(listener => Object.hasOwn(listener, 'pan:start'))).toBe(false)
});
