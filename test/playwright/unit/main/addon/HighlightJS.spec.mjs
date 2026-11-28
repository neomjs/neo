import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'MainHighlightJSUnit'}, mockMain: false});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import HighlightJs    from '../../../../../src/util/HighlightJs.mjs';

const importDocument  = globalThis.document,
    previousDomAccess = Neo.main?.DomAccess;
let DomAccess, HighlightJS;

// Main imports need a DOM facade while they initialize; it is not the lifetime of a test group.
globalThis.document = new EventTarget();
globalThis.document.baseURI = 'https://example.test/apps/demo/index.html';
previousDomAccess && delete Neo.main.DomAccess;
try {
    ({default: DomAccess}   = await import('../../../../../src/main/DomAccess.mjs'));
    ({default: HighlightJS} = await import('../../../../../src/main/addon/HighlightJS.mjs'))
} finally {
    importDocument === undefined ? delete globalThis.document : globalThis.document = importDocument;
    previousDomAccess && (Neo.main.DomAccess = previousDomAccess)
}

test.describe('Neo.main.addon.HighlightJS resources and line lifetime', () => {
    let originalBase, originalHljs, originalLoad, originalScript, originalStylesheet, originalUtilHljs, originalDocument;

    // A parallel worker can re-enter this cached module after another group has finished.
    test.beforeEach(() => {
        originalDocument = globalThis.document;
        globalThis.document = new EventTarget();
        globalThis.document.baseURI = 'https://example.test/apps/demo/index.html';
        originalBase       = Neo.config.basePath;
        originalHljs       = globalThis.hljs;
        originalLoad       = HighlightJs.load;
        originalScript     = DomAccess.loadScript;
        originalStylesheet = DomAccess.loadStylesheet;
        originalUtilHljs   = HighlightJs.hljs;
        Neo.config.basePath = '../../';
    });

    test.afterEach(() => {
        Neo.config.basePath             = originalBase;
        HighlightJs.load                = originalLoad;
        HighlightJs.hljs                = originalUtilHljs;
        DomAccess.loadScript            = originalScript;
        DomAccess.loadStylesheet        = originalStylesheet;
        originalHljs === undefined ? delete globalThis.hljs : globalThis.hljs = originalHljs;
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument
    });

    test('default loads the shared module and line-number styles without a classic script', async () => {
        const events = [], library = {highlightBlock() {}};
        const addon  = {
            highlightJsPath: HighlightJS.config.highlightJsPath,
            themePath      : './resources/lib/highlightjs-custom-github-theme.css'
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
        DomAccess.loadStylesheet = async href => events.push(href);

        await HighlightJS.prototype.loadFiles.call(addon);

        expect(events).toEqual([
            'module', '../../resources/lib/highlightjs-line-numbers.css', addon.themePath
        ]);
        expect(globalThis.hljs).toBe(library)
    });

    test('an explicit classic bundle path remains honored', async () => {
        const scripts = [], styles = [], library = {};
        const addon   = {
            highlightJsPath: '/custom/highlight.js',
            themePath      : '/custom/theme.css',
            set(data) { Object.assign(this, data) }
        };

        HighlightJs.load = async () => { throw new Error('shared module must not load') };
        DomAccess.loadScript = async path => {
            scripts.push(path);
            if (path === addon.highlightJsPath) globalThis.hljs = library;
            else expect(globalThis.hljs).toBe(library)
        };
        DomAccess.loadStylesheet = async href => styles.push(href);

        await HighlightJS.prototype.loadFiles.call(addon, {highlightJsPath: '/custom/highlight.js'});
        expect(scripts).toEqual(['/custom/highlight.js']);
        expect(globalThis.hljs).toBe(library);
        expect(styles).toEqual(['../../resources/lib/highlightjs-line-numbers.css', '/custom/theme.css'])
    });

    test('named themes retain app-relative paths and custom paths survive', () => {
        const hrefs = [], addon = {};
        DomAccess.loadStylesheet = href => hrefs.push(href);

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

    test('missing, empty and already-numbered leaves are no-ops', () => {
        const addon = {isReady: true};
        globalThis.hljs = {highlightBlock() {throw new Error('leaf must not be highlighted')}};

        for (const node of [null, {textContent: ''}, {textContent: 'one', querySelector: () => ({})}]) {
            document.getElementById = () => node;
            expect(() => HighlightJS.prototype.syntaxHighlight.call(addon, {vnodeId: 'code'})).not.toThrow()
        }
    });

    test('unready highlighting queues the unchanged request without touching DOM', () => {
        const data  = {vnodeId: 'code', windowId: 'window-a'}, calls = [],
              addon = {isReady: false, cacheMethodCall: call => calls.push(call)};
        document.getElementById = () => {throw new Error('not ready')};
        HighlightJS.prototype.syntaxHighlight.call(addon, data);
        expect(calls).toEqual([{fn: 'syntaxHighlight', data}]);
        expect(calls[0].data).toBe(data)
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
