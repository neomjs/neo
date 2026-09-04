import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoGridRowWindowIdForwardingTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Canvas         from '../../../../src/component/Canvas.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Row            from '../../../../src/grid/Row.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * A grid row is a component, not a container, so the `windowId` cascade `container.Base` performs
 * for its items does not reach the cell components a row owns in `components`. After a cross-window
 * move every row carries the new id and every pooled cell keeps the old one; a canvas cell then
 * re-transfers its node to the opener's main thread on remount, where the node no longer exists,
 * and never registers again. The row already relays `mounted` and `theme` by hand; `windowId` is
 * the third config the same relay must carry.
 */
const APP = 'NeoGridRowWindowIdForwardingTest';

test.describe('Neo.grid.Row forwards windowId to its cell components', () => {
    let cell, row;

    test.afterEach(() => {
        cell?.destroy?.();
        row?.destroy?.();
        cell = row = null
    });

    test('a component cell takes the row\'s new windowId, as it already takes its theme', () => {
        row  = Neo.create(Row,       {appName: APP, windowId: 'w1'});
        cell = Neo.create(Component, {appName: APP, windowId: 'w1', parentComponent: row});

        row.components = {live: cell};

        row.windowId = 'w2';
        expect(cell.windowId, 'the pooled cell follows the row into the new window').toBe('w2');

        // The sibling relay, as the control: theme has forwarded since the pool existed.
        row.theme = 'neo-theme-dark';
        expect(cell.theme).toBe('neo-theme-dark')
    });

    test('a canvas cell drops its registration on the id change and re-registers with the new windowId on remount', async () => {
        const transfers      = [],
              mainThread     = Neo.main ??= {},
              workers        = Neo.worker ??= {},
              originalAccess = mainThread.DomAccess,
              originalCanvas = workers.Canvas;

        // The single-thread unit run has neither a main thread nor a canvas worker: record the
        // transfer and answer it the way the addon does, by resolving the component's registration
        // callback for that node; accept the unregister a registered canvas issues on teardown.
        mainThread.DomAccess = {
            transferCanvasToWorker(opts) {
                transfers.push(opts);
                Neo.getComponent(opts.componentId)?.registerCanvasCallbacks?.[opts.nodeId]?.()
            }
        };
        workers.Canvas = {unregisterCanvas() {}};

        try {
            row  = Neo.create(Row,    {appName: APP, windowId: 'w1'});
            cell = Neo.create(Canvas, {appName: APP, windowId: 'w1', monitorSize: false, offscreenRegistered: true, parentComponent: row});

            row.components = {live: cell};

            row.windowId = 'w2';
            expect(cell.windowId).toBe('w2');
            expect(cell.offscreenRegistered, 'a new window invalidates the old registration').toBe(false);

            cell.mounted = true;

            await expect.poll(() => transfers.length, {message: 'the remount transfers the canvas once'}).toBe(1);
            expect(transfers[0].windowId, 'to the new window, not the opener').toBe('w2');
            await expect.poll(() => cell.offscreenRegistered, {message: 'and the registration completes'}).toBe(true)
        } finally {
            cell?.destroy?.();
            cell = null;
            mainThread.DomAccess = originalAccess;
            workers.Canvas       = originalCanvas
        }
    });
});
