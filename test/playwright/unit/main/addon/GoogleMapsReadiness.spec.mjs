import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainGoogleMapsTest'
    },
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

// GoogleMaps imports the eager DomAccess and DomEvents main-thread singletons, both of which touch
// `document` at import time. EventTarget stand-ins are enough: no arm here drives a DOM path, only
// the addon's own readiness contract.
const originalDocument = globalThis.document,
      originalSlot     = Neo.main?.addon?.GoogleMaps,
      originalWindow   = globalThis.window,
      documentRef      = new EventTarget(),
      windowRef        = new EventTarget();

documentRef.body            = {};
documentRef.documentElement = {};
documentRef.head            = {appendChild: () => {}};
documentRef.createElement   = () => ({});

globalThis.document = documentRef;
globalThis.window   = windowRef;

Neo.Main ??= {};

originalSlot && delete Neo.main.addon.GoogleMaps;

// The harness installs its own Neo.main.DomAccess; importing the real module on top of it collides
// in unitTestMode, so the slot is vacated for the real singleton and restored afterwards.
const originalDomAccess = Neo.main.DomAccess;

delete Neo.main.DomAccess;

const {default: DomAccess}  = await import('../../../../../src/main/DomAccess.mjs'),
      {default: GoogleMaps} = await import('../../../../../src/main/addon/GoogleMaps.mjs');

// The export is a class, but `Main` instantiates every addon, so the object the engine actually
// consults is an instance. `preloadFilesDelay: false` keeps `construct()` from starting a background
// load these arms would race against.
const addon  = Neo.create(GoogleMaps, {preloadFilesDelay: false}),
      addon2 = Neo.create(GoogleMaps, {preloadFilesDelay: false});

/**
 * @summary The Maps addon must not report ready before `google.maps` exists.
 *
 * ## The defect these arms exist for
 *
 * `https://maps.googleapis.com/maps/api/js` returns a BOOTSTRAP STUB, not the API. The script's
 * `load` event fires when that stub finishes downloading, while `google.maps` is populated only
 * after the stub's own asynchronous fetch completes and calls the function named by `callback`.
 *
 * On `dev` the addon awaited `DomAccess.loadScript` alone and passed `callback=Neo.emptyFn`, so it
 * requested the exact readiness signal and discarded it. `Base#executeLoadFiles` then resolved
 * `#loadFilesPromise`, the addon reported `isReady`, and the first `create()` threw
 * `ReferenceError: google is not defined`. Measured in a browser: the example rendered its toolbar
 * and produced no map at all.
 *
 * ## Why the interception arm is separate, and is the important one
 *
 * The race has two halves, and fixing either alone leaves the example broken:
 *
 * 1. `loadFiles()` settling on the wrong signal — arms 1 to 3.
 * 2. `interceptRemotes` not listing the methods that dereference `google` on entry. `RemoteMethodAccess`
 *    caches a remote call only when the method is listed there, so `create` executed immediately
 *    regardless of `isReady` — arm 4.
 *
 * A correct `loadFiles()` still leaves `create` unguarded when nothing declares it interceptible,
 * which is why arm 4 does not depend on any of the others.
 *
 * No arm touches the network: the bootstrap is simulated by resolving a stubbed `loadScript` and then
 * invoking the global the addon registered, which is exactly the ordering the live API produces.
 */

const
    CALLBACK     = 'neoGoogleMapsApiLoaded',
    // The addon parks its shared load here so a second caller awaits the first rather than stealing
    // its callback. Each arm needs a fresh one, or it would await a load a previous arm settled.
    API_LOAD_KEY = Symbol.for('neo.main.addon.GoogleMaps.apiLoad');

/**
 * Runs `loadFiles()` against a stubbed loader, with a `this` carrying nothing the method needs
 * beyond what it reads itself.
 * @param {Function} loadScript Replacement for `DomAccess.loadScript`.
 * @param {Function} callback Receives a `run()` that invokes the real `loadFiles`.
 * @returns {Promise<void>}
 */
async function withStubbedLoader(loadScript, callback) {
    const original = DomAccess.loadScript;

    DomAccess.loadScript = loadScript;
    delete globalThis[API_LOAD_KEY];

    try {
        await callback(() => addon.loadFiles())
    } finally {
        DomAccess.loadScript = original;
        delete globalThis[API_LOAD_KEY];
        delete globalThis[CALLBACK]
    }
}

/**
 * @param {Promise} promise
 * @param {Number} [ms=150]
 * @returns {Promise<Boolean>} true when the promise settled inside the window.
 */
async function settledWithin(promise, ms=150) {
    const pending = Symbol('pending');

    return await Promise.race([
        promise.then(() => true, () => true),
        new Promise(resolve => setTimeout(() => resolve(pending), ms))
    ]) !== pending
}

test.describe('main.addon.GoogleMaps readiness (#18829)', () => {
    test('loadFiles does not settle when only the bootstrap script has loaded', async () => {
        await withStubbedLoader(() => Promise.resolve(), async run => {
            const promise = run();

            // The stub resolved immediately, which is exactly what dev treated as readiness.
            expect(
                await settledWithin(promise),
                'loadFiles must still be pending while google.maps does not exist'
            ).toBe(false);

            // Only the API calling back may release it.
            globalThis[CALLBACK]();

            expect(await settledWithin(promise), 'and must settle once the API calls back').toBe(true)
        })
    });

    test('loadFiles hands the API a callback name it actually installed, then cleans it up', async () => {
        let requestedUrl;

        await withStubbedLoader(url => {
            requestedUrl = url;
            return Promise.resolve()
        }, async run => {
            const promise = run();

            expect(typeof globalThis[CALLBACK], 'the callback is registered before the request is made')
                .toBe('function');

            const params = new URL(requestedUrl).searchParams,
                  name   = params.get('callback');

            expect(name, 'the URL names the global the addon installed').toBe(CALLBACK);
            expect(globalThis[name], 'and that name resolves to a function').toBeInstanceOf(Function);

            // Neo.emptyFn was the discarded signal on dev; naming it again would reintroduce the bug.
            expect(name, 'never a no-op').not.toBe('Neo.emptyFn');

            // Google's own console warning asked for this, and it is correct once the callback is honoured.
            expect(params.get('loading'), 'the loader is asked for its async mode').toBe('async');

            globalThis[CALLBACK]();
            await promise;

            expect(globalThis[CALLBACK], 'the global does not outlive the load').toBeUndefined()
        })
    });

    test('a second instance awaits the first load instead of hanging on a stolen callback', async () => {
        let requests = 0;

        await withStubbedLoader(() => {
            requests++;
            return Promise.resolve()
        }, async run => {
            // Two instances, as Main would hold if a workspace addon subclassed this one: one
            // className each, one `registerAddon` singleton each, both calling loadFiles().
            const first  = run(),
                  second = addon2.loadFiles();

            expect(requests, 'the API is requested once for the window, not once per instance').toBe(1);

            // The bootstrap fires exactly one callback. Before the load was shared, the second
            // instance had overwritten the first's global, so this released only the second and the
            // first waited forever with isReady stuck false.
            globalThis[CALLBACK]();

            expect(await settledWithin(first),  'the first instance is released').toBe(true);
            expect(await settledWithin(second), 'and so is the second').toBe(true)
        })
    });

    test('a failed script request rejects rather than hanging forever', async () => {
        await withStubbedLoader(() => Promise.reject(new Error('network down')), async run => {
            // Without the rejection path the promise would wait for a callback that can never arrive.
            await expect(run()).rejects.toThrow('network down');

            expect(globalThis[CALLBACK], 'and the callback is cleaned up on failure').toBeUndefined()
        })
    });

    test('every method dereferencing the google global on entry is interceptible', () => {
        // Asserted on the INSTANCE, because that is the object RemoteMethodAccess reads: it consults
        // `pkg.interceptRemotes`, and `pkg` is what Main instantiated. A static-config assertion would
        // pass on a class whose instances no longer carry the list.
        const intercepted = addon.interceptRemotes ?? [];

        // DERIVED, not enumerated. Listing today's two names would pin today's answer and let the
        // next method that reaches `google` while unlisted — the exact defect this covers — pass green.
        // Read descriptors rather than properties: Neo backs configs with accessors, and touching
        // one on a bare prototype runs engine machinery that throws. A plain method is a `value`.
        const
            prototype = Object.getPrototypeOf(addon),
            touching  = Object.getOwnPropertyNames(prototype).filter(name => {
                const {value} = Object.getOwnPropertyDescriptor(prototype, name);

                return name !== 'constructor' && typeof value === 'function' && /\bgoogle\./.test(String(value))
            });

        expect(touching.length, 'the probe found the methods it is meant to judge').toBeGreaterThan(0);

        // Two exemptions, each for a stated reason. Naming them here is what stops a future method
        // joining them silently — the probe finds it, and this list is where someone has to argue.
        const EXEMPT = {
            // Names google.maps.Marker only inside the `else` branch its `mapCreated` listener
            // guards, so it waits on the map rather than on the API.
            addMarker: true,
            // The loader itself. It cannot wait for readiness, because it is what causes readiness;
            // intercepting it would deadlock. The probe matches it on its own `google.maps` early-out,
            // which is a guard against a load already done, not a dereference on entry.
            loadFiles: true
        };

        const required = touching.filter(name => !EXEMPT[name]);

        expect(
            required.filter(name => !intercepted.includes(name)),
            `every method reaching google on entry must be interceptible — found in ${touching.join(', ')}`
        ).toEqual([]);

        expect(addon.remote.app, 'the intercepted methods are remotely reachable in the first place')
            .toEqual(expect.arrayContaining(intercepted))
    })
});

test.afterAll(() => {
    globalThis.document = originalDocument;
    globalThis.window   = originalWindow;

    Neo.main.DomAccess = originalDomAccess;
    originalSlot && (Neo.main.addon.GoogleMaps = originalSlot)
});
