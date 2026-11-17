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
