import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasBootstrapTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import SharedCanvas    from '../../../../src/app/SharedCanvas.mjs';
import Sparkline       from '../../../../src/component/Sparkline.mjs';
import CanvasGroups    from '../../../../src/worker/CanvasGroups.mjs';

/**
 * A cold app worker has no `Neo.worker.Canvas` proxy until its window's canvas worker registers one. If that worker
 * fails to load, or never answers, a canvas component's `initAsync()` must end at the group's bounded failure: no
 * `TypeError` from the missing proxy, no renderer load, and no wait left pending.
 */
test.describe('canvas components boot against a canvas worker that never becomes ready', () => {
    class BootCanvas extends SharedCanvas {
        static config = {
            className         : 'Test.CanvasBootstrap.SharedCanvas',
            rendererClassName : 'Test.CanvasBootstrap.Renderer',
            rendererImportPath: 'test/canvas/Renderer.mjs'
        }
    }

    Neo.setupClass(BootCanvas);

    let restore;

    /**
     * @summary A cold app worker whose canvas group `g1` holds window `w1` and is judged by the real registry.
     * @returns {Object} `{errors, groups, starts, unhandled}`
     */
    function coldWorker() {
        const groups          = Neo.create(CanvasGroups, {startBound: 20}),
              errors          = [],
              starts          = [],
              unhandled       = [],
              onReject        = error => unhandled.push(error),
              {Canvas}        = Neo.worker,
              consoleError    = console.error,
              startWorker     = Neo.worker.Manager.startWorker,
              whenCanvasReady = Neo.currentWorker.whenCanvasReady;

        delete Neo.worker.Canvas;
        Neo.worker.Manager.startWorker    = async data => {starts.push(data); return true};
        Neo.currentWorker.whenCanvasReady = windowId => groups.whenReady(windowId);
        console.error                     = (...args) => errors.push(args);
        process.on('unhandledRejection', onReject);

        restore = () => {
            Canvas === undefined ? delete Neo.worker.Canvas : Neo.worker.Canvas = Canvas;
            Neo.worker.Manager.startWorker    = startWorker;
            Neo.currentWorker.whenCanvasReady = whenCanvasReady;
            console.error                     = consoleError;
            process.off('unhandledRejection', onReject)
        };

        groups.addWindow({group: 'g1', windowId: 'w1'});

        return {errors, groups, starts, unhandled}
    }

    test.afterEach(() => restore?.());

    for (const [name, Cls] of [['SharedCanvas', BootCanvas], ['Sparkline', Sparkline]]) {
        for (const cause of ['load', 'silent']) {
            test(`${name}: a canvas worker that ${cause === 'load' ? 'fails to load' : 'stays silent'} ends initAsync at the bounded failure`, async () => {
                const {errors, groups, starts, unhandled} = coldWorker(),
                      component                           = Neo.create(Cls, {appName: 'CanvasBootstrapTest', id: `boot-${name}-${cause}`, windowId: 'w1'});

                if (cause === 'load') {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    groups.fail('g1', 'load')
                }

                await Promise.race([component.ready(), new Promise((resolve, reject) => setTimeout(() => reject(new Error('initAsync never ended')), 1000))]);

                expect(starts).toEqual([{name: 'canvas', windowId: 'w1'}]);
                expect(errors).toHaveLength(1);
                expect(errors[0][1]).toMatchObject({cause, code: 'NEO_WORKER_START_FAILED', destination: 'canvas', windowId: 'w1'});
                expect(groups.groups.get('g1').waiters.size, 'no wait is left pending').toBe(0);
                expect(Neo.worker.Canvas, 'no renderer load was attempted').toBeUndefined();
                expect(unhandled).toEqual([]);

                component.destroy()
            })
        }
    }
});
