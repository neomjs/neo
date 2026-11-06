import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainOpenStreetMapsTest'
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

// The addon imports the eager DomAccess and DomEvents main-thread singletons, which touch `document` at import
// time. EventTarget stand-ins are enough: the arms drive the addon's own methods, never a DOM path.
const originalDocument = globalThis.document,
      originalOl       = globalThis.ol,
      originalSlot     = Neo.main?.addon?.OpenStreetMaps,
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

originalSlot && delete Neo.main.addon.OpenStreetMaps;

// The harness installs its own Neo.main.DomAccess; importing the real module on top of it collides in
// unitTestMode, so the slot is vacated for the real singleton and restored afterwards.
const originalDomAccess = Neo.main.DomAccess;

delete Neo.main.DomAccess;

const {default: DomAccess}             = await import('../../../../../src/main/DomAccess.mjs'),
      {default: DomEvents}             = await import('../../../../../src/main/DomEvents.mjs'),
      {default: OpenStreetMaps}        = await import('../../../../../src/main/addon/OpenStreetMaps.mjs'),
      {default: OpenStreetMapsWrapper} = await import('../../../../../src/component/wrapper/OpenStreetMaps.mjs');

/**
 * @summary The OpenStreetMaps addon keeps markers in one `ol.source.Vector` per map, and reports zoom changes and
 * marker clicks with the two messages `Neo.component.wrapper.OpenStreetMaps` listens for.
 *
 * OpenLayers is replaced by the stand-ins below, which keep only the calls the addon makes, so no arm touches the
 * network. The real build was driven once against the OSM example (see the PR that added this file).
 */

/**
 * A stand-in OpenLayers namespace with the classes the addon uses
 * @returns {Object}
 */
function createOl() {
    class Options {
        constructor(options = {}) {this.options = options}
    }

    class Feature {
        constructor(properties) {this.properties = {...properties}}
        get(key)        {return this.properties[key]}
        getStyle()      {return this.style}
        set(key, value) {this.properties[key] = value}
        setStyle(style) {this.style = style}
    }

    class VectorSource {
        features = new Set()
        addFeature(feature)    {this.features.add(feature)}
        clear()                {this.features.clear()}
        getFeatures()          {return [...this.features]}
        hasFeature(feature)    {return this.features.has(feature)}
        removeFeature(feature) {this.features.delete(feature)}
    }

    class View extends Options {
        zoom = this.options.zoom
        getCenter()       {return this.center}
        getZoom()         {return this.zoom}
        setCenter(center) {this.center = center}
    }

    class Map extends Options {
        disposed   = false
        hits       = []
        listeners  = {}
        properties = {}
        viewport   = {style: {cursor: ''}, title: ''}

        dispose() {this.disposed = true}
        emit(type, event) {this.listeners[type]?.(event)}
        forEachFeatureAtPixel(pixel, callback) {
            for (const feature of this.hits) {
                const result = callback(feature);
                if (result) return result
            }
        }
        get(key)          {return this.properties[key]}
        getView()         {return this.options.view}
        getViewport()     {return this.viewport}
        on(type, fn)      {this.listeners[type] = fn}
        set(key, value)   {this.properties[key] = value}
        setTarget(target) {this.target = target}
    }

    class Style extends Options {
        getImage() {return this.options.image}
    }

    const named = {black: [0, 0, 0, 1], red: [255, 0, 0, 1]};

    return {
        Feature,
        Map,
        View,
        color  : {asArray: color => named[color]},
        control: {Attribution: class Attribution extends Options {}, FullScreen: class FullScreen extends Options {}, Zoom: class Zoom extends Options {}},
        geom   : {Point: class Point extends Options {}},
        layer  : {Tile: class Tile extends Options {}, Vector: class Vector extends Options {}},
        source : {OSM: class OSM extends Options {}, Vector: VectorSource},
        style  : {
            Circle: class Circle extends Options {},
            Fill  : class Fill extends Options {},
            Icon  : class Icon extends Options {},
            Stroke: class Stroke extends Options {},
            Style,
            Text  : class Text extends Options {}
        }
    }
}

const addon  = Neo.create(OpenStreetMaps, {preloadFilesDelay: false}),
      mapId  = 'osm-1',
      center = {lat: 64.9, lng: -19};

test.describe('main.addon.OpenStreetMaps markers and messages', () => {
    let messages, originalGetElement, originalMouseData, originalSend;

    /**
     * @param {Object} [options]
     * @returns {Promise<Object>} The stand-in map
     */
    const createMap = async (options = {}) => {
        await addon.create({center, id: mapId, zoom: 6, ...options});
        return addon.maps[mapId]
    };

    /**
     * @returns {Object[]} The features in the map's source
     */
    const features = () => addon.vectorSources[mapId]?.getFeatures() || [];

    /**
     * @returns {String[]} The ids of the markers on the map
     */
    const markerIds = () => features().map(feature => feature.get('neoId'));

    test.beforeEach(() => {
        globalThis.ol = createOl();

        messages           = [];
        originalGetElement = DomAccess.getElement;
        originalMouseData  = DomEvents.getMouseEventData;
        originalSend       = DomEvents.sendMessageToApp;

        DomAccess.getElement        = id => id === mapId ? {} : null;
        // Serializing a native event is DomEvents' own concern; the stand-in event has nothing to serialize
        DomEvents.getMouseEventData = () => ({});
        DomEvents.sendMessageToApp  = message => messages.push(message)
    });

    test.afterEach(() => {
        addon.removeMap({mapId});

        DomAccess.getElement        = originalGetElement;
        DomEvents.getMouseEventData = originalMouseData;
        DomEvents.sendMessageToApp  = originalSend
    });

    test('a marker added before its map exists lands in the map once it is created', async () => {
        addon.addMarker({id: 'm-1', mapId, position: center});
        expect(features()).toHaveLength(0);

        await createMap();

        expect(features().map(feature => feature.get('neoId'))).toEqual(['m-1'])
    });

    test('commands sent before the map exists apply in order, so the last word on each marker counts once it is created', async () => {
        addon.addMarker({id: 'removed', mapId, position: center});
        addon.removeMarker({id: 'removed', mapId});

        addon.addMarker({id: 'hidden', mapId, position: center});
        addon.hideMarker({id: 'hidden', mapId});

        addon.addMarker({id: 'shown', mapId, position: center});
        addon.hideMarker({id: 'shown', mapId});
        addon.showMarker({id: 'shown', mapId});

        await createMap();
        expect(markerIds()).toEqual(['shown']);

        addon.showMarker({id: 'hidden', mapId});
        expect(markerIds()).toEqual(['shown', 'hidden'])
    });

    test('destroyMarkers and removeMap drop the markers waiting for their map, and no other map\'s', async () => {
        addon.addMarker({id: 'old', mapId, position: center});
        addon.destroyMarkers({id: mapId, mapId});
        addon.addMarker({id: 'new',   mapId,          position: center});
        addon.addMarker({id: 'other', mapId: 'osm-2', position: center});

        await createMap();
        expect(markerIds()).toEqual(['new']);

        addon.removeMap({mapId});
        addon.addMarker({id: 'stale', mapId, position: center});
        addon.removeMap({mapId});
        await createMap();
        expect(markerIds(), 'a marker waiting for a removed map does not reach the next one').toEqual([]);

        expect(addon.markers['osm-2'].other, 'the other map keeps its waiting marker').toBeDefined();
        addon.removeMap({mapId: 'osm-2'})
    });

    test('a remounted wrapper shows its current Store\'s markers, and reports no map while unmounted', async () => {
        const originalAddon = Neo.main.addon.OpenStreetMaps;

        let wrapper;

        // The wrapper calls the addon through this slot; in the app worker it is the remote proxy
        Neo.main.addon.OpenStreetMaps = addon;

        try {
            wrapper = Neo.create(OpenStreetMapsWrapper, {
                appName          : 'MainOpenStreetMapsTest',
                center,
                id               : mapId,
                markerStoreConfig: {data: [{id: 'old', position: center}, {id: 'kept', position: center}]},
                zoom             : 6
            });

            wrapper.afterSetMounted(true, false);
            await expect.poll(() => wrapper.mapCreated).toBe(true);
            expect(markerIds()).toEqual(['old', 'kept']);

            wrapper.markerStore.remove('old');
            expect(markerIds()).toEqual(['kept']);

            wrapper.afterSetMounted(false, true);
            expect(wrapper.mapCreated).toBe(false);
            expect(addon.maps[mapId]).toBeUndefined();

            wrapper.afterSetMounted(true, false);
            await expect.poll(() => wrapper.mapCreated).toBe(true);
            expect(markerIds()).toEqual(['kept'])
        } finally {
            wrapper?.destroy();
            Neo.main.addon.OpenStreetMaps = originalAddon
        }
    });

    test('a marker id is replaced, hidden, shown and removed, each step idempotent', async () => {
        await createMap();

        addon.addMarker({id: 'm-1', mapId, position: center, title: 'First'});
        addon.addMarker({id: 'm-1', mapId, position: center, title: 'Second'});
        expect(features().map(feature => feature.get('title'))).toEqual(['Second']);

        addon.hideMarker({id: 'm-1', mapId});
        addon.hideMarker({id: 'm-1', mapId});
        expect(features()).toHaveLength(0);
        expect(addon.markers[mapId]['m-1'], 'a hidden marker is kept for showMarker()').toBeDefined();

        addon.showMarker({id: 'm-1', mapId});
        addon.showMarker({id: 'm-1', mapId});
        expect(features()).toHaveLength(1);

        addon.removeMarker({id: 'm-1', mapId});
        addon.removeMarker({id: 'm-1', mapId});
        expect(features()).toHaveLength(0);
        expect(addon.markers[mapId]['m-1']).toBeUndefined()
    });

    test('destroyMarkers clears the map, and removeMap releases it', async () => {
        const map = await createMap();

        addon.addMarker({id: 'm-1', mapId, position: center});
        addon.addMarker({id: 'm-2', mapId, position: center});

        addon.destroyMarkers({id: mapId, mapId});
        expect(features()).toHaveLength(0);
        expect(addon.markers[mapId]).toBeUndefined();

        addon.removeMap({mapId});
        expect(map.disposed).toBe(true);
        expect(addon.maps[mapId]).toBeUndefined()
    });

    test('a click reports the topmost marker under the pointer, and a click on no marker reports nothing', async () => {
        const map = await createMap();

        addon.addMarker({id: 'm-1', mapId, position: center});
        addon.addMarker({id: 'm-2', mapId, position: center});

        map.emit('click', {originalEvent: {}, pixel: [0, 0]});
        expect(messages).toHaveLength(0);

        map.hits = features().reverse();
        map.emit('click', {originalEvent: {}, pixel: [10, 10]});

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({id: 'm-2', path: [{cls: [], id: mapId}], type: 'openStreetMapMarkerClick'})
    });

    test('a view change reports the zoom only when the level changed', async () => {
        const map = await createMap();

        map.emit('moveend');
        expect(messages, 'a pan keeps the zoom').toHaveLength(0);

        map.getView().zoom = 8;
        map.emit('moveend');
        map.emit('moveend');

        expect(messages).toEqual([{id: mapId, path: [{cls: [], id: mapId}], type: 'openStreetMapZoomChange', value: 8}])
    });

    test('hovering a marker shows its title and a pointer cursor on the viewport', async () => {
        const map = await createMap();

        addon.addMarker({id: 'm-1', mapId, position: center, title: 'Reykjavik'});

        map.hits = features();
        map.emit('pointermove', {pixel: [10, 10]});
        expect(map.getViewport()).toEqual({style: {cursor: 'pointer'}, title: 'Reykjavik'});

        map.hits = [];
        map.emit('pointermove', {pixel: [50, 50]});
        expect(map.getViewport()).toEqual({style: {cursor: ''}, title: ''})
    });

    test('the attribution always shows, zoom buttons unless turned off, fullscreen when asked', async () => {
        let map = await createMap();

        expect(map.options.controls.map(control => control.constructor.name)).toEqual(['Attribution', 'Zoom']);

        addon.removeMap({mapId});
        map = await createMap({fullscreenControl: true, zoomControl: false});

        expect(map.options.controls.map(control => control.constructor.name)).toEqual(['Attribution', 'FullScreen'])
    });

    test('a Google circle symbol renders as a circle, never below 1px, and other markers use an icon', async () => {
        await createMap();

        const imageOf = icon => {
            addon.addMarker({icon, id: 'm-1', mapId, position: center});
            return features()[0].getStyle().getImage()
        };

        let circle = imageOf({fillColor: 'red', fillOpacity: 1, path: 0, scale: 12, strokeColor: 'darkred', strokeWeight: 2});

        expect(circle.constructor.name).toBe('Circle');
        expect(circle.options.radius).toBe(12);
        expect(circle.options.fill.options.color).toEqual([255, 0, 0, 1]);

        expect(imageOf({fillColor: 'red', path: 0, scale: -5}).options.radius, 'a negative scale').toBe(1);
        expect(imageOf({fillColor: 'red', path: 0, scale: -5}).options.fill.options.color, 'Google leaves an unset fill transparent').toEqual([255, 0, 0, 0]);

        expect(imageOf('pin.png').options.src).toBe('pin.png');
        expect(imageOf({url: 'pin.png'}).options.src).toBe('pin.png');
        expect(imageOf(undefined).options.src).toMatch(/^data:image\/svg\+xml;base64,/)
    });

    test('setCenter moves the view to the position', async () => {
        const map = await createMap();

        addon.setCenter({id: mapId, value: {lat: 10, lng: 20}});

        expect(map.getView().getCenter()).toEqual([20, 10])
    })
});

test.afterAll(() => {
    globalThis.document = originalDocument;
    globalThis.window   = originalWindow;

    originalOl === undefined ? delete globalThis.ol : globalThis.ol = originalOl;

    Neo.main.DomAccess = originalDomAccess;
    originalSlot && (Neo.main.addon.OpenStreetMaps = originalSlot)
});
