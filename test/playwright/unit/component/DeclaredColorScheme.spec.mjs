/**
 * @file test/playwright/unit/component/DeclaredColorScheme.spec.mjs
 * @summary Pins how `Canvas`, `Mermaid`, `MonacoEditor` and `AmChart` answer for a theme their `themeMap` does not
 * name: by the `--neo-color-scheme` the theme build wrote into the theme map, once that map reaches the App worker.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DeclaredColorSchemeTest'}});

import {test, expect}                      from '@playwright/test';
import Neo                                 from '../../../../src/Neo.mjs';
import * as core                           from '../../../../src/core/_export.mjs';
import InstanceManager                     from '../../../../src/manager/Instance.mjs';
import Canvas                              from '../../../../src/component/Canvas.mjs';
import AmChart                             from '../../../../src/component/wrapper/AmChart.mjs';
import Mermaid                             from '../../../../src/component/wrapper/Mermaid.mjs';
import MonacoEditor                        from '../../../../src/component/wrapper/MonacoEditor.mjs';
import {declaredScheme, resolveThemeValue} from '../../../../src/util/Theme.mjs';

const appName = 'DeclaredColorSchemeTest';

/**
 * Each component's resolver and what it answers for a dark and a light declared scheme.
 */
const COMPONENTS = [
    ['Canvas',       Canvas,       instance => instance.resolveColorScheme(), 'dark',    'light'],
    ['Mermaid',      Mermaid,      instance => instance.resolveTheme(),       'dark',    'default'],
    ['MonacoEditor', MonacoEditor, instance => instance.resolveEditorTheme(), 'vs-dark', 'vs'],
    ['AmChart',      AmChart,      instance => instance.resolveTheme(),       'dark',    null]
];

/**
 * A theme map as `buildScripts/build/themes.mjs` writes it, with two fixture themes no component map names, and
 * a declared scheme for a shipped theme that contradicts its `themeMap` entry, so that entry visibly wins.
 */
const FILE_INFO = {
    schemes: {
        'neo-theme-fixture-dark' : 'dark',
        'neo-theme-fixture-light': 'light',
        'neo-theme-neo-dark'     : 'light'
    },
    themes: {}
};

test.describe('A component answers a theme its themeMap does not name by the declared scheme (#22495)', () => {
    let instances = [],
        addons, cssMap;

    test.beforeEach(() => {
        const addon = Neo.ns('Neo.main.addon', true);

        // The instances never mount, so their teardown messages are the only addon calls: absorb them
        addons             = {AmCharts: addon.AmCharts, MonacoEditor: addon.MonacoEditor};
        addon.AmCharts     = {destroy: () => {}};
        addon.MonacoEditor = {destroyInstance: () => {}, setTheme: async () => {}, updateOptions: async () => {}};
        cssMap             = Neo.cssMap;
        Neo.cssMap         = {fileInfo: FILE_INFO}
    });

    test.afterEach(() => {
        const addon = Neo.main.addon;

        instances.forEach(instance => instance.destroy());
        instances  = [];
        Neo.cssMap = cssMap;

        Object.entries(addons).forEach(([name, previous]) => {previous === undefined ? delete addon[name] : addon[name] = previous})
    });

    const create = (cls, config) => {
        const instance = Neo.create(cls, {appName, ...config});
        instances.push(instance);
        return instance
    };

    test('the util reads the declared scheme, and an explicit entry wins over it, null included', () => {
        expect(declaredScheme('neo-theme-fixture-dark')).toBe('dark');
        expect(declaredScheme('neo-theme-unknown')).toBe(null);
        expect(declaredScheme(null)).toBe(null);

        expect(resolveThemeValue('neo-theme-fixture-dark', {}, {dark: 'D', light: 'L'})).toBe('D');
        expect(resolveThemeValue('neo-theme-fixture-dark', {'neo-theme-fixture-dark': null}, {dark: 'D', light: 'L'})).toBe(null);
        expect(resolveThemeValue('neo-theme-unknown', {}, {dark: 'D', light: 'L'})).toBe(undefined)
    });

    COMPONENTS.forEach(([name, cls, resolve, dark, light]) => {
        test(`AC-1 · ${name}: a fixture theme no map names resolves by its declared scheme`, () => {
            expect(resolve(create(cls, {theme: 'neo-theme-fixture-dark'}))).toBe(dark);
            expect(resolve(create(cls, {theme: 'neo-theme-fixture-light'}))).toBe(light)
        });

        test(`AC-2 and AC-3 · ${name}: a theme its map names keeps the map's answer`, () => {
            expect(resolve(create(cls, {theme: 'neo-theme-neo-dark'})), 'the shipped entry beats a contradicting scheme').toBe(dark);
            expect(resolve(create(cls, {theme: 'neo-theme-fixture-dark', themeMap: {'neo-theme-fixture-dark': light}}))).toBe(light)
        });
    });

    test('before the map arrives, an unnamed theme falls back, and arrival re-applies it once', () => {
        const {currentWorker} = Neo,
              on              = currentWorker.on,
              listeners       = [];

        Neo.cssMap        = undefined;
        currentWorker.on  = (name, fn, scope, options) => listeners.push({name, fn, options});

        try {
            const editor = create(MonacoEditor, {theme: 'neo-theme-fixture-dark'}),
                  named  = create(Mermaid,      {theme: 'neo-theme-neo-dark'});

            expect(editor.resolveEditorTheme(), 'no map yet: the editor keeps its own theme').toBe('vs');
            expect(listeners.map(entry => [entry.name, entry.options?.once])).toEqual([['themeMapLoaded', true], ['themeMapLoaded', true]]);

            let applied = 0;
            named.applyColorScheme = () => applied++;

            Neo.cssMap = {fileInfo: FILE_INFO};
            listeners.forEach(entry => entry.fn());

            expect(editor.editorTheme, 'the unnamed theme re-resolves to dark').toBe('vs-dark');
            expect(applied, 'a theme the map names is not re-applied').toBe(0)
        } finally {
            currentWorker.on = on
        }
    });

    test('MonacoEditor: options.theme outranks the declared scheme, and a late map re-sends each theme in build order', () => {
        const explicit        = {options: {theme: 'hc-black'}, theme: 'neo-theme-fixture-dark'},
              read            = editor => [editor.resolveEditorTheme(), editor.editorTheme, editor.getInitialOptions().theme],
              warm            = create(MonacoEditor, explicit),
              {currentWorker} = Neo,
              on              = currentWorker.on,
              listeners       = [],
              sent            = [];

        expect(read(warm), 'the map arrives first').toEqual(['hc-black', 'hc-black', 'hc-black']);

        Neo.cssMap       = undefined;
        currentWorker.on = (name, fn) => name === 'themeMapLoaded' && listeners.push(fn);

        try {
            const editors = {
                auto    : create(MonacoEditor, {theme: 'neo-theme-fixture-dark'}),
                pinned  : create(MonacoEditor, {theme: 'neo-theme-fixture-dark', themeMap: {'neo-theme-fixture-dark': 'hc-black'}}),
                explicit: create(MonacoEditor, explicit)
            };

            Object.entries(editors).forEach(([name, editor]) => {editor.afterSetEditorTheme = value => sent.push([name, value])});

            Neo.cssMap = {fileInfo: FILE_INFO};
            listeners.forEach(fn => fn());

            expect(sent, 'one theme per window: the last editor built paints').toEqual([['auto', 'vs-dark'], ['pinned', 'hc-black'], ['explicit', 'hc-black']]);
            expect(read(editors.explicit), 'the late map ends where a warm boot starts').toEqual(read(warm))
        } finally {
            currentWorker.on = on
        }
    })
});
