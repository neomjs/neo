import {setup} from '../../../setup.mjs';

const appName = 'BufferedSwipeActionsTest';

setup({appConfig: {name: appName}, neoConfig: {unitTestMode: true}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Buffered       from '../../../../../src/list/Buffered.mjs';
import SwipeActions   from '../../../../../src/list/plugin/SwipeActions.mjs';

let list, plugin, actions;

/** @summary Builds the App payload from a row as encoded in the native path. */
function touch(deltaX, row=list.getVdomRoot().cn[1]) {
    const {id, data: {recordId, poolIndex, slotBinding}} = row;

    return {
        contacts   : [{id: 0}],
        deltaX,
        deltaY     : 0,
        gestureId  : 17,
        path       : [{id, data: {recordId: String(recordId), poolIndex: String(poolIndex), slotBinding: String(slotBinding)}}],
        pointerType: 'touch'
    }
}

/** @summary Creates the same pooled list with either native record-identity mode. */
async function createList(useInternalId=false) {
    actions = [];
    list = Neo.create(Buffered, {
        appName,
        bufferRowRange: 1,
        height        : 100,
        itemHeight    : 20,
        plugins       : [{module: SwipeActions, action: ({key}) => actions.push(key)}],
        store         : {
            data       : Array.from({length: 80}, (_, id) => ({id, name: `Item ${id}` })),
            keyProperty: 'id',
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]}
        },
        useInternalId
    });
    await list.initVnode();
    list.mounted = true;
    list.onResize({rect: {height: 100}});
    list.createItems(true);
    plugin = list.getPlugin('plugin-list-swipe-actions')
}

test.beforeEach(() => createList());

test.afterEach(() => {
    list.isDestroyed || list.destroy()
});

test('a swipe commits its typed record key once even if a terminal repeats', () => {
    plugin.onPanStart(touch(-15));
    plugin.onPanMove(touch(-95));
    expect(plugin.distance).toBe(80);
    expect(actions).toEqual([]);

    const terminal = {...touch(-95), contacts: []};
    plugin.onPanEnd(terminal);
    plugin.onPanEnd(terminal);

    expect(actions).toEqual([0]);
    expect(plugin.slotId).toBe(null)
});

test('a stale native path stays invalid after a physical slot recycles away and back', async () => {
    const original = touch(-20);

    list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 400});
    await expect.poll(() => list.getVdomRoot().cn[1].data.recordId).not.toBe(0);
    list.onScrollCapture({target: {id: list.id}, scrollLeft: 0, scrollTop: 0});
    await expect.poll(() => list.getVdomRoot().cn[1].data.recordId).toBe(0);

    expect(touch(-20).path[0].id).toBe(original.path[0].id);
    plugin.onPanStart(original);
    plugin.onPanEnd({...original, deltaX: -100, contacts: []});
    expect(actions).toEqual([]);
    expect(plugin.slotId).toBe(null);

    const current = plugin.getBinding(touch(-20));
    expect(plugin.commit(current)).toBe(true);
    expect(plugin.commit(current)).toBe(false);
    expect(actions).toEqual([0])
});

test('the default internal row identity still supplies the actual Store key to the action', async () => {
    list.destroy();
    await createList(true);

    const event   = touch(-20),
          binding = plugin.getBinding(event);

    expect(event.path[0].data.recordId).toMatch(/^neo-record-/);
    expect(plugin.commit(binding)).toBe(true);
    expect(actions).toEqual([0])
});
