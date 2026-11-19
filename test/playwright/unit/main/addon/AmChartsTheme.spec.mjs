/**
 * @file test/playwright/unit/main/addon/AmChartsTheme.spec.mjs
 * @summary Pins that the AmCharts addon creates each chart in the theme it was asked for, and that
 * no chart inherits the theme of the one created before it.
 */

import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainAmChartsThemeTest'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

// The addon imports the eager DomAccess main-thread singleton, which touches `document` at import time.
// EventTarget stand-ins are enough: the arms drive the addon's own `create`, never a DOM path.
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
 * @summary The slice of amCharts 4 the addon's create path touches. Its theme list behaves like the
 * library's: `useTheme` adds a theme once, `unuseAllThemes` empties the list, and an object reads the
 * list when it is created.
 * @returns {Object}
 */
function am4coreStub() {
    const registry = {themes: []};

    return {
        registry,
        created: [],
        createFromConfig(config, id, type) {
            if (config.fail) {
                throw new Error('createFromConfig failed')
            }

            const chart = {id, type, disposed: false, themesAtCreate: [...registry.themes], dispose() {this.disposed = true}};

            this.created.push(chart);
            return chart
        },
        unuseAllThemes() {
            registry.themes.length = 0
        },
        useTheme(theme) {
            registry.themes.includes(theme) || registry.themes.push(theme)
        }
    }
}

test.describe('Neo.main.addon.AmCharts#create', () => {
    const darkTheme = function am4themes_dark() {};

    let addon, stub;

    // One addon for the file: its `destroy({id})` is the remote that disposes a chart, not the
    // instance's teardown, and `create` reads the amCharts globals at call time.
    test.beforeAll(async () => {
        addon = Neo.create(AmCharts, {preloadFilesDelay: false});
        await addon.ready()
    });

    test.beforeEach(() => {
        stub = am4coreStub();

        globalThis.am4core        = stub;
        globalThis.am4themes_dark = darkTheme;
        globalThis.am4charts      = {PieChart: class PieChart {}}
    });

    test.afterEach(() => {
        delete globalThis.am4core;
        delete globalThis.am4themes_dark;
        delete globalThis.am4charts
    });

    test('a dark chart is created dark and keeps the dark theme for what it creates later', () => {
        addon.create({config: {}, id: 'chart-dark', package: 'am4charts', theme: 'dark', type: 'PieChart'});

        const [chart] = stub.created;

        expect(chart.themesAtCreate).toEqual([darkTheme]);
        expect(chart.themes, 'series, labels and legend items ask the chart').toEqual([darkTheme]);
        expect(stub.registry.themes, 'and the next chart finds the list empty').toEqual([])
    });

    test('a chart without a theme is created in amCharts\' light default', () => {
        addon.create({config: {}, id: 'chart-light', package: 'am4charts', theme: null, type: 'PieChart'});

        const [chart] = stub.created;

        expect(chart.themesAtCreate).toEqual([]);
        expect(chart.themes).toEqual([])
    });

    test('a light chart created right after a dark one inherits nothing from it', () => {
        addon.create({config: {}, id: 'chart-dark',  package: 'am4charts', theme: 'dark', type: 'PieChart'});
        addon.create({config: {}, id: 'chart-light', package: 'am4charts',               type: 'PieChart'});

        const [dark, light] = stub.created;

        expect(dark.themesAtCreate).toEqual([darkTheme]);
        expect(light.themesAtCreate).toEqual([]);
        expect(light.themes).toEqual([]);
        expect(dark.themes, 'the dark chart keeps its own theme').toEqual([darkTheme])
    });

    test('a chart created again under its id replaces the one before it, which is disposed', () => {
        addon.create({config: {}, id: 'chart-again', package: 'am4charts', theme: 'dark', type: 'PieChart'});
        addon.create({config: {}, id: 'chart-again', package: 'am4charts',               type: 'PieChart'});

        const [first, second] = stub.created;

        expect(first.disposed, 'the first chart does not keep running').toBe(true);
        expect(second.disposed).toBe(false);
        expect(addon.hasChart('chart-again')).toBe(true);
        expect(addon.charts['chart-again']).toBe(second)
    });

    test('a create that throws leaves no theme registered for the next chart', () => {
        expect(() => addon.create({config: {fail: true}, id: 'chart-throws', package: 'am4charts', theme: 'dark', type: 'PieChart'}))
            .toThrow('createFromConfig failed');
        expect(stub.registry.themes).toEqual([]);

        addon.create({config: {}, id: 'chart-after', package: 'am4charts', type: 'PieChart'});

        expect(stub.created[0].themesAtCreate, 'the next chart is light').toEqual([])
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
