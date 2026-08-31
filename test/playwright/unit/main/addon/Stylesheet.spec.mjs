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
documentRef.body    = {classList: {add: () => {}}};
globalThis.document = documentRef;

/**
 * Runs one root-derivation scenario: pins the named Neo.config fields, invokes the real method
 * via prototype (the addon's construct runs the full theme bootstrap, which the derivation
 * contract does not need), and returns the emitted hrefs. Config is restored in ALL cases —
 * worker processes share Neo.config across spec files.
 * @param {Object} configPatch Fields to pin on Neo.config for the scenario.
 * @param {Function} invoke Receives the prototype-bound surface; drives the method under test.
 * @returns {String[]} The hrefs handed to createStyleSheet, in emission order.
 */
function deriveHrefs(configPatch, invoke) {
    const
        saved = {},
        start = createdLinks.length;

    Object.keys(configPatch).forEach(key => {
        saved[key] = Neo.config[key];
        Neo.config[key] = configPatch[key]
    });

    try {
        invoke(Stylesheet.prototype)
    } finally {
        Object.keys(saved).forEach(key => {
            saved[key] === undefined ? delete Neo.config[key] : Neo.config[key] = saved[key]
        })
    }

    return createdLinks.slice(start).map(link => link.href)
}

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

/**
 * @summary The dist-root derivation contract: absolute mounts resolve, relative arithmetic is pinned.
 *
 * `basePath.substring(6)` means "strip one `../../` hop" — exact for the engine's own serving,
 * where a dist page lives inside `dist/<env>/apps/<app>/`. An absolute mount (one index per app
 * OUTSIDE dist, a fixed-mount server arrangement) has no hops to strip: `/mount/` became `udio/…` and
 * every stylesheet 404'd, black-paging the app. The absolute branch derives `basePath +
 * 'dist/<env>/'`; every relative shape below is pinned byte-identical to the pre-fix arithmetic.
 */
test.describe('Neo.main.addon.Stylesheet — dist-root derivation', () => {
    test.beforeEach(() => {
        globalThis.document = documentRef
    });

    test.afterEach(() => {
        createdLinks.length = 0
    });

    test('an absolute mount in a dist environment derives basePath + env for every global sheet', () => {
        const hrefs = deriveHrefs(
            {appPath: 'apps/probe/app.mjs', basePath: '/mount/', environment: 'dist/production', themes: ['neo-theme-dark']},
            proto => proto.addGlobalCss()
        );

        expect(hrefs).toEqual([
            '/mount/dist/production/css/src/Global.css',
            '/mount/dist/production/css/theme-dark/Global.css'
        ])
    });

    test('an absolute mount in a source environment derives basePath + dist/<env>', () => {
        const hrefs = deriveHrefs(
            {appPath: 'apps/probe/app.mjs', basePath: '/mount/', environment: 'development', themes: ['neo-theme-light']},
            proto => proto.addGlobalCss()
        );

        expect(hrefs).toEqual([
            '/mount/dist/development/css/src/Global.css',
            '/mount/dist/development/css/theme-light/Global.css'
        ])
    });

    test('addThemeFiles emits mount-rooted theme sheets on an absolute basePath', async () => {
        const hrefs = deriveHrefs(
            {appPath: 'apps/probe/app.mjs', basePath: '/mount-b/', environment: 'dist/development', themes: ['neo-theme-dark']},
            proto => proto.addThemeFiles({className: 'Neo.grid.Container', folders: ['src', 'theme-dark']})
        );

        expect(hrefs).toEqual([
            '/mount-b/dist/development/css/src/grid/Container.css',
            '/mount-b/dist/development/css/theme-dark/grid/Container.css'
        ])
    });

    test('the relative shapes stay byte-identical: source app, docs app, and a page inside the dist tree', () => {
        // source app two levels deep: rootPath '' + path '../../dist/development/'
        expect(deriveHrefs(
            {appPath: 'apps/probe/app.mjs', basePath: '../../', environment: 'development', themes: ['neo-theme-dark']},
            proto => proto.addGlobalCss()
        )).toEqual([
            '../../dist/development/css/src/Global.css',
            '../../dist/development/css/theme-dark/Global.css'
        ]);

        // the docs config uses the single-hop compensation
        expect(deriveHrefs(
            {appPath: 'docs/app.mjs', basePath: '../', environment: 'development', themes: ['neo-theme-dark']},
            proto => proto.addGlobalCss()
        )).toEqual([
            '../dist/development/css/src/Global.css',
            '../dist/development/css/theme-dark/Global.css'
        ]);

        // a dist-mode page lives inside dist/<env>: rootPath '../../' + path ''
        expect(deriveHrefs(
            {appPath: 'apps/probe/app.mjs', basePath: '../../../../', environment: 'dist/production', themes: ['neo-theme-dark']},
            proto => proto.addGlobalCss()
        )).toEqual([
            '../../css/src/Global.css',
            '../../css/theme-dark/Global.css'
        ])
    });

    test('the Font Awesome path survives absolute mounts in bundled envs and stays package-rooted otherwise', () => {
        const probe = (basePath, environment) => {
            const saved = {basePath: Neo.config.basePath, environment: Neo.config.environment};

            Object.assign(Neo.config, {basePath, environment});

            try {
                return Stylesheet.prototype.getFontAwesomePath()
            } finally {
                Object.assign(Neo.config, saved)
            }
        };

        // bundled env, absolute mount: the black-page path — must root at the mount's dist tree
        expect(probe('/mount/', 'dist/production'))
            .toBe('/mount/dist/production/resources/fontawesome-free/css/all.min.css');

        // bundled env, relative serving: the original strip-one-hop arithmetic, byte-identical
        expect(probe('../../../../', 'dist/production'))
            .toBe('../../resources/fontawesome-free/css/all.min.css');

        // source + dist/esm fetch from node_modules, basePath-rooted in both mount shapes
        expect(probe('/mount/', 'development'))
            .toBe('/mount/node_modules/@fortawesome/fontawesome-free/css/all.min.css');
        expect(probe('../../', 'dist/esm'))
            .toBe('../../node_modules/@fortawesome/fontawesome-free/css/all.min.css')
    });

    test('getAbsoluteDistRoot answers absolute and fully-qualified mounts, and yields to relative arithmetic', () => {
        const probe = (basePath, environment) => {
            const saved = {basePath: Neo.config.basePath, environment: Neo.config.environment};

            Object.assign(Neo.config, {basePath, environment});

            try {
                return Stylesheet.prototype.getAbsoluteDistRoot()
            } finally {
                Object.assign(Neo.config, saved)
            }
        };

        expect(probe('/mount/', 'dist/esm')).toBe('/mount/dist/esm/');
        expect(probe('https://cdn.example/app/', 'dist/production')).toBe('https://cdn.example/app/dist/production/');
        expect(probe('../../', 'dist/production')).toBeNull();
        expect(probe('../../../../', 'development')).toBeNull()
    });
});
