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
