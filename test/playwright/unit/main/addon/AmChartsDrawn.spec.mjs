/**
 * @file test/playwright/unit/main/addon/AmChartsDrawn.spec.mjs
 * @summary Pins when the AmCharts addon says a chart is drawn: once it is ready and neither it nor a series
 * holds data awaiting validation, and never for a chart that a destroy or a new create took away first.
 */

import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainAmChartsDrawnTest'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

// The addon imports the eager DomAccess main-thread singleton, which touches `document` at import time.
// EventTarget stand-ins are enough: the arms drive the addon's own remotes, never a DOM path.
const originalDocument = globalThis.document,
      originalWindow   = globalThis.window,
      originalSlot     = Neo.main?.addon?.AmCharts,
      documentRef      = new EventTarget(),
      windowRef        = new EventTarget();

documentRef.body            = {};
documentRef.documentElement = {};
documentRef.head            = {appendChild: () => {}};
documentRef.createElement   = () => ({});

globalThis.document = documentRef;
globalThis.window   = windowRef;

Neo.Main ??= {};

originalSlot && delete Neo.main.addon.AmCharts;

// The harness installs its own Neo.main.DomAccess; importing the real module on top of it collides in
// unitTestMode, so the slot is vacated for the real singleton and restored afterwards.
const originalDomAccess = Neo.main.DomAccess;

delete Neo.main.DomAccess;

const {default: AmCharts} = await import('../../../../../src/main/addon/AmCharts.mjs');

/**
 * @summary The slice of amCharts 4 whenDrawn reads: a chart's `isReady()`, its `dataInvalid` and its
 * series' `dataInvalid`. A chart starts neither ready nor validated, as a fresh `createFromConfig()` does.
 * @returns {Object}
 */
function am4coreStub() {
    return {
        created: [],
        createFromConfig() {
            const chart = {
                _ready     : false,
                dataInvalid: true,
                disposed   : false,
                series     : {values: [{dataInvalid: true}]},
                dispose() {this.disposed = true},
                isReady() {return this._ready}
            };

            this.created.push(chart);
            return chart
        },
        unuseAllThemes() {},
        useTheme      () {}
    }
}

/**
 * @param {Object} chart
 */
function draw(chart) {
    chart._ready                       = true;
    chart.dataInvalid                  = false;
    chart.series.values[0].dataInvalid = false
}

/**
 * @param {Number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

test.describe('Neo.main.addon.AmCharts#whenDrawn', () => {
    const originalRaf = globalThis.requestAnimationFrame;

    let addon, stub;

    test.beforeAll(async () => {
        // whenDrawn looks once per frame; a timer stands in for the browser's frames
        globalThis.requestAnimationFrame = fn => setTimeout(fn, 1);

        addon = Neo.create(AmCharts, {preloadFilesDelay: false});
        await addon.ready()
    });

    test.beforeEach(() => {
        stub = am4coreStub();

        globalThis.am4core   = stub;
        globalThis.am4charts = {PieChart: class PieChart {}}
    });

    test.afterEach(() => {
        delete globalThis.am4core;
        delete globalThis.am4charts
    });

    test.afterAll(() => {
        originalRaf ? globalThis.requestAnimationFrame = originalRaf : delete globalThis.requestAnimationFrame
    });

    test('an id without a chart answers false', async () => {
        expect(await addon.whenDrawn({id: 'chart-none'})).toBe(false)
    });

    test('a chart answers true once it is ready, its data validated and its series\' data too', async () => {
        addon.create({config: {}, id: 'chart-drawn', package: 'am4charts', type: 'PieChart'});

        const [chart] = stub.created;

        let answer;

        addon.whenDrawn({id: 'chart-drawn'}).then(value => {answer = value});

        await wait(20);
        expect(answer, 'created, not ready').toBeUndefined();

        chart._ready = true;
        await wait(20);
        expect(answer, 'ready, its data awaits validation').toBeUndefined();

        chart.dataInvalid = false;
        await wait(20);
        expect(answer, 'a series\' data awaits validation').toBeUndefined();

        chart.series.values[0].dataInvalid = false;
        await expect.poll(() => answer).toBe(true)
    });

    test('a chart that is already drawn answers true', async () => {
        addon.create({config: {}, id: 'chart-ready', package: 'am4charts', type: 'PieChart'});
        draw(stub.created[0]);

        expect(await addon.whenDrawn({id: 'chart-ready'})).toBe(true)
    });

    test('a chart destroyed before it is drawn answers false', async () => {
        addon.create({config: {}, id: 'chart-gone', package: 'am4charts', type: 'PieChart'});

        const answer = addon.whenDrawn({id: 'chart-gone'});

        addon.destroy({id: 'chart-gone'});

        expect(await answer).toBe(false)
    });

    test('a chart created again under its id answers false for the chart it replaced', async () => {
        addon.create({config: {}, id: 'chart-again', package: 'am4charts', type: 'PieChart'});

        const answer = addon.whenDrawn({id: 'chart-again'});

        addon.create({config: {}, id: 'chart-again', package: 'am4charts', type: 'PieChart'});
        draw(stub.created[1]);

        expect(await answer, 'the first chart never drew').toBe(false);
        expect(await addon.whenDrawn({id: 'chart-again'}), 'the second one did').toBe(true)
    })
});

test.afterAll(() => {
    globalThis.document = originalDocument;
    globalThis.window   = originalWindow;

    Neo.main.DomAccess = originalDomAccess;

    // One worker runs every unit spec file: leave the slot as this file found it, so a later file's
    // stand-in for the remote addon is not shadowed by the class imported here.
    originalSlot ? Neo.main.addon.AmCharts = originalSlot : delete Neo.main.addon.AmCharts
});
