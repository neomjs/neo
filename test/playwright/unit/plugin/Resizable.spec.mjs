import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'PluginResizableTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Resizable      from '../../../../src/plugin/Resizable.mjs';

/**
 * @summary Neo.plugin.Resizable finds the rect its resize stays inside on drag:start.
 *
 * The arms run `onDragStart` on a stub plugin that already holds its drag zone, so no main-thread setup runs.
 */

/**
 * @param {Object[]} path The drag:start path, innermost first
 * @returns {Promise<{measured: Array, plugin: Object}>}
 */
async function dragStart(path) {
    const measured = [],
          plugin   = {
              addBodyCursorCls     : Neo.emptyFn,
              boundaryContainerId  : 'workspace-1',
              boundaryContainerRect: null,
              delegationCls        : 'neo-dialog',
              dragZone             : {dragStart: Neo.emptyFn},
              owner                : {
                  boundaryContainerId: 'workspace-1',
                  getDomRect         : async id => {measured.push(id); return {bottom: 740, height: 740, left: 0, top: 0, width: 1280}},
                  wrapperStyle       : {}
              },
              styleConfig          : 'wrapperStyle'
          };

    Resizable.prototype.onDragStart.call(plugin, {path});

    await new Promise(resolve => setTimeout(resolve, 0));

    return {measured, plugin}
}

test.describe('Neo.plugin.Resizable boundary container', () => {
    test('a container that is no ancestor of the dragged element is measured by its id', async () => {
        // A dialog renders on the body: the workspace that bounds it is not on its path
        const {measured, plugin} = await dragStart([
            {cls: ['neo-dialog'], id: 'dialog-1', rect: {}, tagName: 'div'},
            {cls: [],             id: 'body',     rect: {}, tagName: 'body'}
        ]);

        expect(measured).toEqual(['workspace-1']);
        expect(plugin.boundaryContainerRect.bottom).toBe(740)
    });

    test('an ancestor container is read from the path, with no measuring', async () => {
        const rect               = {bottom: 500, height: 500, left: 0, top: 0, width: 800},
              {measured, plugin} = await dragStart([
                  {cls: ['neo-dialog'], id: 'dialog-1',    rect: {}, tagName: 'div'},
                  {cls: [],             id: 'workspace-1', rect,     tagName: 'div'}
              ]);

        expect(measured).toEqual([]);
        expect(plugin.boundaryContainerRect).toBe(rect)
    })
});

/**
 * A stub plugin past drag:start, resizing into `style` as a dialog does
 * @param {Number|undefined} opacity The owner's opacity before the gesture
 * @returns {Object}
 */
function startedGesture(opacity) {
    const plugin = {
        addBodyCursorCls   : Neo.emptyFn,
        closeGesture       : Resizable.prototype.closeGesture,
        delegationCls      : 'neo-dialog',
        dragZone           : {dragEnd: Neo.emptyFn, dragProxy: {style: {height: '300px', width: '750px'}}, dragStart: Neo.emptyFn},
        owner              : {focus: Neo.emptyFn, getDomRect: async () => ({}), style: {left: '40px', top: '20px', ...opacity === undefined ? {} : {opacity}}},
        removeAllNodes     : Neo.emptyFn,
        removeBodyCursorCls: Neo.emptyFn,
        styleConfig        : 'style'
    };

    Resizable.prototype.onDragStart.call(plugin, {path: []});

    return plugin
}

test.describe('Neo.plugin.Resizable gesture ends', () => {
    for (const opacity of [0.8, undefined]) {
        // null removes the key on a single-node owner, where a deleted key keeps the gesture's 0.3
        const kept = {opacity: opacity ?? null};

        test(`a release commits the preview's box and gives back the owner's opacity (${opacity ?? 'none'})`, () => {
            const plugin = startedGesture(opacity);

            expect(plugin.owner.style.opacity, 'the gesture dims the owner').toBe(0.3);

            Resizable.prototype.onDragEnd.call(plugin, {});

            expect(plugin.owner.style).toEqual({height: '300px', left: '40px', top: '20px', transform: 'none', width: '750px', ...kept})
        });

        test(`a cancel commits nothing and gives back the owner's opacity (${opacity ?? 'none'})`, () => {
            const plugin = startedGesture(opacity);

            Resizable.prototype.onDragCancel.call(plugin);

            expect(plugin.owner.style).toEqual({left: '40px', top: '20px', ...kept});
            expect(plugin.isDragging).toBe(false)
        })
    }
});
