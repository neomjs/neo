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

test.describe('Neo.main.addon.HighlightJS resources and line lifetime', () => {
    let originalBase, originalHljs, originalLoad, originalScript, originalStylesheet, originalUtilHljs, originalGetElement;

    test.beforeEach(() => {
        originalBase       = Neo.config.basePath;
        originalHljs       = globalThis.hljs;
        originalLoad       = HighlightJs.load;
        originalScript     = DomAccess.loadScript;
        originalStylesheet = Neo.main.addon.Stylesheet;
        originalUtilHljs   = HighlightJs.hljs;
        originalGetElement = document.getElementById;
        Neo.config.basePath = '../../';
    });

    test.afterEach(() => {
        Neo.config.basePath             = originalBase;
        HighlightJs.load                = originalLoad;
        HighlightJs.hljs                = originalUtilHljs;
        originalGetElement === undefined ? delete document.getElementById : document.getElementById = originalGetElement;
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

    for (const operation of ['addLine', 'removeLine']) {
        test(`a late ${operation} request for a removed code leaf does no DOM work (#20869)`, () => {
            const lookups = [];
            document.getElementById = id => {lookups.push(id); return null};

            expect(() => HighlightJS.prototype.syntaxHighlightLine.call({isReady: true}, {
                vnodeId: 'retired-code-leaf', [operation]: 20
            })).not.toThrow();
            expect(lookups).toEqual(['retired-code-leaf'])
        })
    }

    test('a mounted code leaf adds and removes line marks and scrolls only the added line', () => {
        const added = new Set(), removed = new Set(['neo-highlighted-line']), scrolls = [], selectors = [],
              rows  = {
                  '[data-line-number="20"]': {parentNode: {
                      classList     : {add: cls => added.add(cls)},
                      scrollIntoView: options => scrolls.push({line: 20, options})
                  }},
                  '[data-line-number="1"]': {parentNode: {
                      classList     : {remove: cls => removed.delete(cls)},
                      scrollIntoView: () => {throw new Error('removing a line must not scroll')}
                  }}
              };
        document.getElementById = id => {
            expect(id).toBe('mounted-code-leaf');
            return {querySelector: selector => {selectors.push(selector); return rows[selector]}}
        };

        HighlightJS.prototype.syntaxHighlightLine.call({isReady: true}, {
            vnodeId: 'mounted-code-leaf', addLine: 20, removeLine: 1
        });

        expect([...added]).toEqual(['neo-highlighted-line']);
        expect([...removed]).toEqual([]);
        expect(selectors).toEqual(['[data-line-number="20"]', '[data-line-number="1"]']);
        expect(scrolls).toEqual([{line: 20, options: {behavior: 'smooth', block: 'start', inline: 'nearest'}}])
    });

    test('library readiness caches the original line request before any DOM lookup', () => {
        const data  = {vnodeId: 'not-published-yet', addLine: 20, removeLine: 1},
              calls = [], queued = Promise.resolve(),
              addon = {isReady: false, cacheMethodCall: call => {calls.push(call); return queued}};
        document.getElementById = () => {throw new Error('DOM lookup before the library is ready')};

        expect(HighlightJS.prototype.syntaxHighlightLine.call(addon, data)).toBe(queued);
        expect(calls).toEqual([{fn: 'syntaxHighlightLine', data}]);
        expect(calls[0].data).toBe(data)
    });
});
