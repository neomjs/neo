import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'MainHighlightJSUnit'}, mockMain: false});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import HighlightJs    from '../../../../../src/util/HighlightJs.mjs';

const originalDocument = globalThis.document,
    previousDomAccess  = Neo.main?.DomAccess;
globalThis.document = new EventTarget();
globalThis.document.baseURI = 'https://example.test/apps/demo/index.html';
previousDomAccess && delete Neo.main.DomAccess;
const {default: DomAccess}   = await import('../../../../../src/main/DomAccess.mjs');
const {default: HighlightJS} = await import('../../../../../src/main/addon/HighlightJS.mjs');

test.describe('Neo.main.addon.HighlightJS resource loading', () => {
    let originalBase, originalHljs, originalLoad, originalScript, originalStylesheet, originalUtilHljs;

    test.beforeEach(() => {
        originalBase       = Neo.config.basePath;
        originalHljs       = globalThis.hljs;
        originalLoad       = HighlightJs.load;
        originalScript     = DomAccess.loadScript;
        originalStylesheet = Neo.main.addon.Stylesheet;
        originalUtilHljs   = HighlightJs.hljs;
        Neo.config.basePath = '../../';
    });

    test.afterEach(() => {
        Neo.config.basePath             = originalBase;
        HighlightJs.load                = originalLoad;
        HighlightJs.hljs                = originalUtilHljs;
        DomAccess.loadScript            = originalScript;
        Neo.main.addon.Stylesheet       = originalStylesheet;
        originalHljs === undefined ? delete globalThis.hljs : globalThis.hljs = originalHljs
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        previousDomAccess && (Neo.main.DomAccess = previousDomAccess)
    });

    test('default loads the shared module before the line-number plugin', async () => {
        const events = [], library = {highlightBlock() {}};
        const addon  = {
            highlightJsPath           : HighlightJS.config.highlightJsPath,
            highlightJsLineNumbersPath: '../../node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js',
            themePath                 : './resources/lib/highlightjs-custom-github-theme.css'
        };

        expect(addon.highlightJsPath).toBeNull();

        HighlightJs.load = async () => {
            events.push('module');
            HighlightJs.hljs = library
        };
        DomAccess.loadScript = async path => {
            expect(globalThis.hljs).toBe(library);
            events.push(path)
        };
        Neo.main.addon.Stylesheet = {createStyleSheet: async ({href}) => events.push(href)};

        await HighlightJS.prototype.loadFiles.call(addon);

        expect(events).toEqual([
            'module', addon.highlightJsLineNumbersPath, addon.themePath
        ])
    });

    test('an explicit classic bundle path remains honored', async () => {
        const scripts = [], library = {};
        const addon   = {
            highlightJsPath           : '/custom/highlight.js',
            highlightJsLineNumbersPath: '/custom/lines.js',
            themePath                 : '/custom/theme.css',
            set(data) { Object.assign(this, data) }
        };

        HighlightJs.load = async () => { throw new Error('shared module must not load') };
        DomAccess.loadScript = async path => {
            scripts.push(path);
            if (path === addon.highlightJsPath) globalThis.hljs = library;
            else expect(globalThis.hljs).toBe(library)
        };
        Neo.main.addon.Stylesheet = {createStyleSheet: async ({href}) => expect(href).toBe('/custom/theme.css')};

        await HighlightJS.prototype.loadFiles.call(addon, {highlightJsPath: '/custom/highlight.js'});
        expect(scripts).toEqual(['/custom/highlight.js', '/custom/lines.js'])
    });

    test('named themes retain app-relative paths and custom paths survive', () => {
        const hrefs = [], addon = {};
        Neo.main.addon.Stylesheet = {createStyleSheet: ({href}) => hrefs.push(href)};

        for (const theme of ['dark', 'light', '/custom/theme.css']) {
            HighlightJS.prototype.switchTheme.call(addon, {theme})
        }

        expect(hrefs).toEqual([
            './resources/lib/highlightjs-custom-dark-theme.css',
            './resources/lib/highlightjs-custom-github-theme.css',
            '/custom/theme.css'
        ]);
        expect(addon.themePath).toBe('/custom/theme.css')
    });
});
