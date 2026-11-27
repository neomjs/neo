import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainStylesheetUnit'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/*
    The harness installs a Neo.main.addon.Stylesheet STUB (setup.mjs, `??=`) for component
    composition, and unitTestMode's namespace guard throws when the real class registers into an
    occupied slot. Worker processes share files, so whether the stub is already there depends on
    file ordering — clear the slot for the real import, and restore whatever occupied it in
    afterAll so sibling files keep the harness contract they set up.
*/
const previousSlot = Neo.main?.addon?.Stylesheet;

previousSlot && delete Neo.main.addon.Stylesheet;

const {default: Stylesheet} = await import('../../../../../src/main/addon/Stylesheet.mjs');

const
    originalDocument = globalThis.document,
    documentRef      = new EventTarget(),
    createdLinks     = [];

// real EventTargets so the spec drives the addon's own listeners through genuine dispatch
documentRef.createElement = () => {
    const link = new EventTarget();

    createdLinks.push(link);
    return link
};
documentRef.head    = {appendChild: () => {}};
globalThis.document = documentRef;

/**
 * @summary The settlement contract of `createStyleSheet`: a load failure must NAME its href.
 *
 * The error listener used to reject bare, so a 404'd theme file surfaced as
 * `unhandled rejection: undefined` — reasonless at every consumer. Both settlement paths are
 * driven through the link's real event dispatch so the instrument owns the seam it certifies.
 */
test.describe('Neo.main.addon.Stylesheet#createStyleSheet', () => {
    // Direct prototype invocation: the method reads only `document` and `Neo.config`, while the
    // addon's construct runs the full theme bootstrap, which needs a real app environment. The
    // seam under test is the method's settlement contract, not the boot sequence.
    const createStyleSheet = data => Stylesheet.prototype.createStyleSheet.call(null, data);

    test.beforeEach(() => {
        // Re-assert the stub: under fully-parallel CI a sibling spec's teardown can delete the
        // global between this file's tests — module-level assignment alone only survives
        // single-worker ordering.
        globalThis.document = documentRef
    });

    test.afterEach(() => {
        createdLinks.length = 0
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        previousSlot && (Neo.main.addon.Stylesheet = previousSlot)
    });

    test('a failed load rejects with an Error naming the requested href', async () => {
        const
            href    = 'https://cdn.test/theme-neo-dark.css',
            promise = createStyleSheet({href}),
            link    = createdLinks.at(-1);

        expect(link.href).toBe(href);

        link.dispatchEvent(new Event('error'));

        const reason = await promise.catch(e => e);

        expect(reason).toBeInstanceOf(Error);
        expect(reason.message).toContain(href)
    });

    test('the positive control: a successful load resolves', async () => {
        const promise = createStyleSheet({href: 'https://cdn.test/theme-neo-light.css'});

        createdLinks.at(-1).dispatchEvent(new Event('load'));

        await expect(promise).resolves.toBeUndefined()
    });
});

test.describe('Neo.main.addon.Stylesheet map-driven loading and variable updates', () => {
    let originalConfig;

    test.beforeEach(() => {
        originalConfig          = Neo.clone(Neo.config, true);
        globalThis.document     = documentRef;
        documentRef.styleSheets = []
    });

    test.afterEach(() => {
        createdLinks.length = 0;

        // Mutate in place so cached module references (`const NeoConfig = Neo.config`) stay attached
        Object.keys(Neo.config).forEach(key => {
            if (!Object.hasOwn(originalConfig, key)) {
                delete Neo.config[key]
            }
        });
        Object.assign(Neo.config, originalConfig)
    });

    test('addThemeFiles requests src, theme-base, and a dual-scheme folder once each, warning once on an unmapped class', async () => {
        const warnings = [],
              origWarn = console.warn;

        console.warn = msg => warnings.push(msg);

        try {
            Object.assign(Neo.config, {
                appPath    : 'apps/portal/app.mjs',
                basePath   : '../../',
                environment: 'development',
                themes     : ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-unmapped']
            });

            const instance = Object.create(Stylesheet.prototype);

            instance.themeMap       = {
                'neo-theme-neo-dark' : ['theme-neo'],
                'neo-theme-neo-light': ['theme-neo']
            };
            instance.unmappedThemes = new Set();
            instance.createStyleSheet = ({href}) => {
                createdLinks.push({href});
                documentRef.styleSheets.push({href});
                return Promise.resolve()
            };

            await instance.addThemeFiles({
                className: 'Neo.Global',
                folders  : ['src', 'theme-base', 'theme-dark', 'theme-neo']
            });

            await instance.addThemeFiles({
                className: 'Neo.button.Base',
                folders  : ['src', 'theme-base', 'theme-dark', 'theme-neo']
            });

            expect(createdLinks.map(l => l.href)).toEqual([
                '../../dist/development/css/src/Global.css',
                '../../dist/development/css/theme-base/Global.css',
                '../../dist/development/css/theme-neo/Global.css',
                '../../dist/development/css/src/button/Base.css',
                '../../dist/development/css/theme-base/button/Base.css',
                '../../dist/development/css/theme-neo/button/Base.css'
            ]);

            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('neo-theme-unmapped')
        } finally {
            console.warn = origWarn
        }
    });

    test('setCssVariable skips null-href style sheets, walks layer blocks, and updates mapped folders per scheme', () => {
        const makeRule = (selectorText, vars) => {
            const store = new Map(Object.entries(vars));

            return {
                selectorText,
                style: {
                    getPropertyValue: key => store.get(key) ?? '',
                    setProperty     : (key, value, priority) => store.set(key, priority ? `${value} !${priority}` : value)
                },
                store
            }
        };

        const neoLightRule = makeRule('.neo-theme-neo-light', {'--probe-color': '#ffffff'}),
              neoDarkRule  = makeRule('.neo-theme-neo-dark',  {'--probe-color': '#000000'}),
              classicRule  = makeRule(':root .neo-theme-dark', {'--probe-color': '#323232'});

        documentRef.styleSheets = [
            // Runtime-inserted <style> element whose href is null
            {
                href    : null,
                cssRules: [makeRule('.dynamic', {'--probe-color': '#999999'})]
            },
            // Shared folder serving both Neo schemes inside an @layer block
            {
                href    : 'https://cdn.test/dist/development/css/theme-neo/Global.css',
                cssRules: [{
                    cssRules: [neoLightRule, neoDarkRule]
                }]
            },
            // Classic theme inside an @layer block
            {
                href    : 'https://cdn.test/dist/development/css/theme-dark/Global.css',
                cssRules: [{
                    cssRules: [classicRule]
                }]
            }
        ];

        const instance = Object.create(Stylesheet.prototype);

        instance.themeMap       = {
            'neo-theme-dark'     : ['theme-dark'],
            'neo-theme-neo-dark' : ['theme-neo'],
            'neo-theme-neo-light': ['theme-neo']
        };
        instance.unmappedThemes = new Set();

        expect(instance.setCssVariable({key: 'probe-color', theme: 'neo-theme-neo-dark',  value: '#112233'})).toBe(true);
        expect(instance.setCssVariable({key: '--probe-color', theme: 'neo-theme-neo-light', value: '#ddeeff'})).toBe(true);
        expect(instance.setCssVariable({key: '--probe-color', theme: 'neo-theme-dark',      value: '#445566'})).toBe(true);
        expect(instance.setCssVariable({key: '--undeclared',  theme: 'neo-theme-neo-dark',  value: '#000000'})).toBe(false);

        expect(neoDarkRule.store.get('--probe-color')).toBe('#112233');
        expect(neoLightRule.store.get('--probe-color')).toBe('#ddeeff');
        expect(classicRule.store.get('--probe-color')).toBe('#445566')
    });
});
