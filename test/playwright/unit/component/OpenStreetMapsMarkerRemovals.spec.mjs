import {setup} from '../../setup.mjs';

const appName = 'OpenStreetMapsMarkerRemovalsTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../src/Neo.mjs';
import * as core             from '../../../../src/core/_export.mjs';
import OpenStreetMapsWrapper from '../../../../src/component/wrapper/OpenStreetMaps.mjs';

test.describe('Neo.component.wrapper.OpenStreetMaps markerStore payload sync', () => {
    let addedMarkers, destroyedCalls, originalAddon;

    test.beforeEach(() => {
        addedMarkers   = [];
        destroyedCalls = [];
        originalAddon  = Neo.main?.addon?.OpenStreetMaps;

        Neo.ns('Neo.main.addon', true);
        Neo.main.addon.OpenStreetMaps = {
            addMarker(data) {
                addedMarkers.push(data);
            },
            destroyMarkers(data) {
                destroyedCalls.push(data);
            },
            removeMap() {}
        };
    });

    test.afterEach(() => {
        if (originalAddon) {
            Neo.main.addon.OpenStreetMaps = originalAddon;
        } else {
            delete Neo.main.addon.OpenStreetMaps;
        }
    });

    test('passes mapId to destroyMarkers and serializes Record fields when markerStore loads or reloads', () => {
        const map = Neo.create(OpenStreetMapsWrapper, {
            appName,
            id               : 'osm-1',
            markerStoreConfig: {
                data: [
                    {id: 'm-1', position: {lat: 10, lng: 20}, title: 'First'},
                    {id: 'm-2', position: {lat: 30, lng: 40}, title: 'Second'}
                ]
            }
        });

        expect(destroyedCalls).toHaveLength(1);
        expect(destroyedCalls[0]).toMatchObject({id: 'osm-1', mapId: 'osm-1'});
        expect(addedMarkers).toHaveLength(2);
        expect(addedMarkers[0]).toMatchObject({id: 'm-1', mapId: 'osm-1', position: {lat: 10, lng: 20}, title: 'First'});
        expect(addedMarkers[1]).toMatchObject({id: 'm-2', mapId: 'osm-1', position: {lat: 30, lng: 40}, title: 'Second'});

        addedMarkers.length   = 0;
        destroyedCalls.length = 0;

        map.markerStore.remove('m-1');

        expect(destroyedCalls).toHaveLength(1);
        expect(destroyedCalls[0]).toMatchObject({id: 'osm-1', mapId: 'osm-1'});
        expect(addedMarkers).toHaveLength(1);
        expect(addedMarkers[0]).toMatchObject({id: 'm-2', mapId: 'osm-1', position: {lat: 30, lng: 40}, title: 'Second'});

        map.destroy();
    });
});
