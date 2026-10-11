/**
 * @file test/playwright/unit/component/Sparkline.spec.mjs
 * @summary Pins the owning-window route used while Sparkline ensures its Canvas Worker.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'ComponentSparklineRoutingTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Sparkline       from '../../../../src/component/Sparkline.mjs';

test.describe('Neo.component.Sparkline worker routing', () => {
    test('the idempotent startWorker ensure carries the component windowId exactly once', async () => {
        const
            originalCanvas      = Neo.worker.Canvas,
            originalStartWorker = Neo.worker.Manager.startWorker,
            startCalls          = [];
        let sparkline;

        Neo.worker.Canvas = {loadModule: async () => {}};
        Neo.worker.Manager.startWorker = async data => {
            startCalls.push(data);
            return true
        };

        try {
            sparkline = Neo.create(Sparkline, {
                appName : 'ComponentSparklineRoutingTest',
                id      : 'component-sparkline-routing',
                windowId: 'sparkline-window'
            });

            await sparkline.ready();

            expect(startCalls).toEqual([{
                name    : 'canvas',
                windowId: 'sparkline-window'
            }])
        } finally {
            sparkline?.destroy();
            Neo.worker.Manager.startWorker = originalStartWorker;

            if (originalCanvas === undefined) {
                delete Neo.worker.Canvas
            } else {
                Neo.worker.Canvas = originalCanvas
            }
        }
    })
});
