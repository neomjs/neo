import {setup}        from '../../../setup.mjs';
import {expect, test} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import '../../../../../src/core/_export.mjs';
import RemoteMethodAccess from '../../../../../src/worker/mixin/RemoteMethodAccess.mjs';

setup({appConfig: {name: 'CesiumJSReadinessTest'}, mockLocalStorage: false, mockMain: false});

// DomAccess is an eager main-thread singleton; these stand-ins only support its import.
const originalDocument  = globalThis.document,
      originalWindow    = globalThis.window,
      originalDomAccess = Neo.main.DomAccess,
      originalMain      = Neo.Main,
      documentRef       = new EventTarget();

documentRef.body = {};
documentRef.documentElement = {};
documentRef.head = {appendChild() {}};
documentRef.createElement = () => ({});
globalThis.document = documentRef;
globalThis.window = new EventTarget();
Neo.Main ??= {};
delete Neo.main.DomAccess;

const {default: DomAccess} = await import('../../../../../src/main/DomAccess.mjs'),
      {default: CesiumJS}  = await import('../../../../../src/main/addon/CesiumJS.mjs');

/** @summary Supplies an explicitly released resource load, without a network request or sleep.
 * @returns {Object}
 */
function deferred() {
    let resolve;
    const promise = new Promise(done => {resolve = done});
    return {promise, resolve}
}

for (const {method, scriptFirst} of [
    {method: 'create', scriptFirst: true}, {method: 'create', scriptFirst: false},
    {method: 'createOsmBuildings', scriptFirst: true}, {method: 'flyTo', scriptFirst: true}
]) {
    test(`${method} waits for both resources (${scriptFirst ? 'script' : 'stylesheet'} first), then runs once`, async () => {
        const script         = deferred(), style = deferred(),
              originalScript = DomAccess.loadScript, originalStyle = DomAccess.loadStylesheet,
              originalCesium = globalThis.Cesium, originalToken = Neo.config.cesiumJsToken,
              originalSlot   = Neo.main.addon.CesiumJS,
              urls           = [], calls = [], replies = [], errors = [],
              viewer         = {scene: {primitives: {add(value) {calls.push(['buildings', value])}}},
                  camera: {flyTo(value) {calls.push(['flight', value])}}},
              library = {
                  Ion               : {},
                  Viewer            : class {constructor(id) {calls.push(['viewer', id]); return viewer}},
                  createWorldTerrain: () => ({}), createOsmBuildings: () => 'buildings',
                  Cartesian3        : {fromDegrees: (...args) => args}, Math: {toRadians: value => value * Math.PI / 180}
              };
        let addon;

        DomAccess.loadScript = url => {urls.push(url); return script.promise};
        DomAccess.loadStylesheet = url => {urls.push(url); return style.promise};
        delete globalThis.Cesium;
        Neo.config.cesiumJsToken = 'readiness-test-token';

        try {
            addon = Neo.create(CesiumJS, {preloadFilesDelay: 0});
            Neo.main.addon.CesiumJS = addon;
            if (method !== 'create') addon.viewers['test-globe'] = viewer;
            // The real dispatch reads interceptRemotes and routes the call through the addon's cache.
            RemoteMethodAccess.prototype.onRemoteMethod.call({
                resolve(msg, value) {replies.push(value)}, reject(msg, error) {errors.push(error)}
            }, {remoteClassName: 'Neo.main.addon.CesiumJS', remoteMethod: method,
                data: {id: 'test-globe', destination: [1, 2, 3], heading: 45, pitch: -30}});
            expect(calls).toEqual([]);
            expect(errors).toEqual([]);

            if (scriptFirst) {
                globalThis.Cesium = library;
                script.resolve();
                await script.promise
            } else {
                style.resolve();
                await style.promise
            }
            expect(addon.isReady).toBe(false);
            expect(replies).toEqual([]);
            expect(library.Ion.defaultAccessToken).toBeUndefined();

            globalThis.Cesium = library;
            script.resolve();
            style.resolve();
            await addon.ready();
            await expect.poll(() => replies.length).toBe(1);
            expect(errors).toEqual([]);
            expect(calls).toHaveLength(1);
            expect(calls[0][0]).toBe(method === 'create' ? 'viewer' : method === 'flyTo' ? 'flight' : 'buildings');
            expect(library.Ion.defaultAccessToken).toBe('readiness-test-token');
            expect(urls).toHaveLength(2);
            expect(urls).toEqual(expect.arrayContaining([
                expect.stringContaining('/1.92/Build/Cesium/Cesium.js'),
                expect.stringContaining('/1.92/Build/Cesium/Widgets/widgets.css')
            ]))
        } finally {
            globalThis.Cesium = library;
            script.resolve(); style.resolve();
            if (addon) {
                await addon.ready();
                // CesiumJS#destroy is a remote viewer stub; use core teardown for this test instance.
                Neo.core.Base.prototype.destroy.call(addon)
            }
            DomAccess.loadScript = originalScript;
            DomAccess.loadStylesheet = originalStyle;
            if (originalCesium === undefined) delete globalThis.Cesium;
            else globalThis.Cesium = originalCesium;
            Neo.config.cesiumJsToken = originalToken
            Neo.main.addon.CesiumJS = originalSlot
        }
    })
}

test.afterAll(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    Neo.main.DomAccess = originalDomAccess;
    Neo.Main = originalMain
});
