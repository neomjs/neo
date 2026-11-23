/**
 * @file test/playwright/unit/component/AmChartDrawn.spec.mjs
 * @summary Pins when an amCharts wrapper says it is drawn: only from the main thread's answer for its
 * latest create or data, never from an answer that a newer create, new data, an unmount or destroy() overtook.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'AmChartDrawnTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import AmChart        from '../../../../src/component/wrapper/AmChart.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

const
    appName     = 'AmChartDrawnTest',
    chartConfig = {series: [{type: 'PieSeries'}]};

/**
 * @param {Number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

test.describe('Neo.component.wrapper.AmChart#drawn', () => {
    let answers, calls, instance, previous;

    test.beforeEach(() => {
        const addon = Neo.ns('Neo.main.addon', true);

        answers  = [];
        calls    = [];
        previous = addon.AmCharts;

        // Each whenDrawn call waits until the arm answers it through `answers`.
        addon.AmCharts = {
            create    : async () => {calls.push('create')},
            destroy   : ()       => {calls.push('destroy')},
            updateData: ()       => {calls.push('updateData')},
            whenDrawn : ()       => {calls.push('whenDrawn'); return new Promise(resolve => answers.push(resolve))}
        }
    });

    test.afterEach(() => {
        instance?.destroy();
        instance = null;

        // One worker runs every unit spec file: a stand-in left here would collide with the real
        // addon class a later file registers under the same namespace.
        const addon = Neo.ns('Neo.main.addon', true);

        previous === undefined ? delete addon.AmCharts : addon.AmCharts = previous
    });

    /**
     * Mounts a chart and answers its create's whenDrawn with true.
     * @param {Object} [config]
     * @returns {Promise<void>}
     */
    async function mountDrawn(config) {
        instance = Neo.create(AmChart, {appName, chartConfig, ...config});
        instance.mounted = true;

        await expect.poll(() => answers.length).toBe(1);
        answers[0](true);
        await expect.poll(() => instance.drawn).toBe(true)
    }

    test('a mounted chart is drawn once the main thread answers for its create', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig});
        instance.mounted = true;

        await expect.poll(() => answers.length).toBe(1);
        expect(calls, 'asked after the create').toEqual(['create', 'whenDrawn']);
        expect(instance.drawn, 'created, not drawn yet').toBe(false);

        answers[0](true);

        await expect.poll(() => instance.drawn).toBe(true);
        expect(instance.vdom['data-drawn']).toBe('true')
    });

    test('a theme re-create drops drawn until the new chart\'s answer', async () => {
        await mountDrawn({theme: 'neo-theme-dark'});

        instance.theme = 'neo-theme-neo-light';

        expect(instance.drawn).toBe(false);
        expect(instance.vdom['data-drawn']).toBeNull();

        await expect.poll(() => answers.length).toBe(2);
        answers[1](true);
        await expect.poll(() => instance.drawn).toBe(true)
    });

    test('an answer for a chart a theme re-create replaced does not set drawn', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-dark'});
        instance.mounted = true;
        await expect.poll(() => answers.length).toBe(1);

        instance.theme = 'neo-theme-neo-light';
        answers[0](true);

        await wait(20);
        expect(instance.drawn, 'the first chart answered late').toBe(false)
    });

    test('new chartData drops drawn until the main thread answers for that data', async () => {
        await mountDrawn();

        instance.chartData = [{country: 'Lithuania', litres: 501.9}];

        expect(instance.drawn).toBe(false);
        await expect.poll(() => answers.length).toBe(2);
        expect(calls.slice(-2), 'asked after the data went out').toEqual(['updateData', 'whenDrawn']);

        answers[1](true);
        await expect.poll(() => instance.drawn).toBe(true)
    });

    test('an unmount drops drawn, and the answer still owed does not set it', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig});
        instance.mounted = true;
        await expect.poll(() => answers.length).toBe(1);

        instance.mounted = false;
        answers[0](true);

        await wait(20);
        expect(instance.drawn).toBe(false)
    });

    test('destroy drops a drawn chart\'s drawn without a render', async () => {
        let updates = 0;

        await mountDrawn();

        instance.update = () => {updates++};
        instance.destroy();

        expect(instance.drawn).toBe(false);
        expect(updates, 'renders while destroying').toBe(0);
        expect(calls.at(-1)).toBe('destroy')
    });

    test('an answer still owed when the chart is destroyed does not set drawn', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig});
        instance.mounted = true;
        await expect.poll(() => answers.length).toBe(1);

        instance.destroy();
        answers[0](true);

        await wait(20);
        expect(instance.drawn).toBe(false)
    })
});
