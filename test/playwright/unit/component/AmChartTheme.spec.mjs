/**
 * @file test/playwright/unit/component/AmChartTheme.spec.mjs
 * @summary Pins which amCharts theme a chart asks the main thread for: resolved from its Neo theme
 * through the component chain, sent with every create, and a new chart when that answer changes.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'AmChartThemeTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import AmChart        from '../../../../src/component/wrapper/AmChart.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which container teardown
// needs to walk to a parent.
import '../../../../src/manager/Instance.mjs';

const
    appName     = 'AmChartThemeTest',
    chartConfig = {series: [{type: 'PieSeries'}]};

/**
 * @summary A container whose class default names a dark theme, so its chart inherits the theme
 * through the chain and declares none of its own.
 */
class DarkScope extends Container {
    static config = {
        className: 'Neo.test.component.AmChartTheme.DarkScope',
        theme    : 'neo-theme-neo-dark'
    }
}

DarkScope = Neo.setupClass(DarkScope);

/**
 * The amCharts theme each shipped Neo theme maps to. `neo-theme-cyberpunk` is the row a test on the
 * theme's name would get wrong: it is dark, and its name does not say so.
 */
const SHIPPED_THEMES = [
    ['neo-theme-cyberpunk',      'dark'],
    ['neo-theme-dark',           'dark'],
    ['neo-theme-light',          null],
    ['neo-theme-material-dark',  'dark'],
    ['neo-theme-material-light', null],
    ['neo-theme-neo-dark',       'dark'],
    ['neo-theme-neo-light',      null]
];

test.describe('Neo.component.wrapper.AmChart#resolveTheme', () => {
    let instance = null;

    test.afterEach(() => {
        // The instance never mounted, so its teardown message is the only addon call: absorb it.
        const addon = Neo.ns('Neo.main.addon', true), previous = addon.AmCharts;

        addon.AmCharts = {destroy: () => {}};
        instance?.destroy();
        previous === undefined ? delete addon.AmCharts : addon.AmCharts = previous;
        instance = null
    });

    SHIPPED_THEMES.forEach(([theme, chartTheme]) => {
        test(`${theme} resolves ${chartTheme}`, () => {
            instance = Neo.create(AmChart, {appName, chartConfig, theme});

            expect(instance.resolveTheme()).toBe(chartTheme)
        })
    });

    test('a theme the map does not carry resolves amCharts\' light default', () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-not-shipped-by-neo'});

        expect(instance.resolveTheme()).toBeNull()
    });

    test('a chart inside a dark container is dark while declaring no theme of its own', () => {
        instance = Neo.create(DarkScope, {
            appName,
            items: [{module: AmChart, chartConfig, reference: 'chart'}]
        });

        const chart = instance.getReference('chart');

        chart.theme = null;

        expect(chart.theme, 'the chart declares nothing').toBeNull();
        expect(chart.resolveTheme(), 'the container decides').toBe('dark')
    })
});

test.describe('a mounted chart asks the addon for its theme', () => {
    let calls, instance, previous;

    test.beforeEach(() => {
        const addon = Neo.ns('Neo.main.addon', true);

        calls    = [];
        previous = addon.AmCharts;

        addon.AmCharts = {
            create    : async opts => {calls.push({fn: 'create', theme: opts.theme})},
            destroy   : opts => {calls.push({fn: 'destroy', id: opts.id})},
            updateData: () => {},
            whenDrawn : async () => true
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

    test('the first create carries the resolved theme', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-dark'});

        instance.mounted = true;

        await expect.poll(() => calls.length).toBe(1);
        expect(calls[0]).toEqual({fn: 'create', theme: 'dark'})
    });

    test('a theme change that changes the amCharts theme creates the chart again in it', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-dark'});

        instance.mounted = true;
        await expect.poll(() => calls.length).toBe(1);

        instance.theme = 'neo-theme-neo-light';

        await expect.poll(() => calls.length).toBe(3);
        expect(calls.slice(1)).toEqual([
            {fn: 'destroy', id: instance.id},
            {fn: 'create',  theme: null}
        ])
    });

    test('a theme change that resolves to the same amCharts theme keeps the chart', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-dark'});

        instance.mounted = true;
        await expect.poll(() => calls.length).toBe(1);

        instance.theme = 'neo-theme-cyberpunk';

        // The create runs 50 ms after its request; waiting past that makes an unwanted one visible.
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(calls).toEqual([{fn: 'create', theme: 'dark'}])
    });

    test('a theme change inside the 50 ms window sends one create, in the newer theme', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-dark'});

        instance.mounted = true;
        instance.theme   = 'neo-theme-neo-light';

        await expect.poll(() => calls.filter(call => call.fn === 'create').length).toBe(1);
        // The cancelled create would have gone out 50 ms after its request; waiting past that makes it visible.
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(calls).toEqual([
            {fn: 'destroy', id: instance.id},
            {fn: 'create',  theme: null}
        ])
    });

    test('an unmount inside the 50 ms window sends no create', async () => {
        instance = Neo.create(AmChart, {appName, chartConfig, theme: 'neo-theme-dark'});

        instance.mounted = true;
        instance.mounted = false;

        // The cancelled create would have gone out 50 ms after its request; waiting past that makes it visible.
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(calls).toEqual([{fn: 'destroy', id: instance.id}])
    })
});
