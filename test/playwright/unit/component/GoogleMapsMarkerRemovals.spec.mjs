import {setup} from '../../setup.mjs';

const appName = 'GoogleMapsMarkerRemovalsTest';

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

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import GoogleMapsWrapper from '../../../../src/component/wrapper/GoogleMaps.mjs';

test.describe('Neo.component.wrapper.GoogleMaps markerStore load & removal sync', () => {
    let addedMarkers, destroyedCalls, originalAddon;

    test.beforeEach(() => {
        addedMarkers   = [];
        destroyedCalls = [];
        originalAddon  = Neo.main?.addon?.GoogleMaps;

        Neo.ns('Neo.main.addon', true);
        Neo.main.addon.GoogleMaps = {
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
            Neo.main.addon.GoogleMaps = originalAddon;
        } else {
            delete Neo.main.addon.GoogleMaps;
        }
    });

    test('passes mapId to destroyMarkers and serializes Record fields when markerStore loads or removes records', () => {
        const map = Neo.create(GoogleMapsWrapper, {
            appName,
            id               : 'gm-1',
            markerStoreConfig: {
                data: [
                    {id: 'm-1', position: {lat: 10, lng: 20}, title: 'First'},
                    {id: 'm-2', position: {lat: 30, lng: 40}, title: 'Second'}
                ]
            }
        });

        expect(destroyedCalls).toHaveLength(1);
        expect(destroyedCalls[0]).toMatchObject({id: 'gm-1', mapId: 'gm-1'});
        expect(addedMarkers).toHaveLength(2);
        expect(addedMarkers[0]).toMatchObject({id: 'm-1', mapId: 'gm-1', position: {lat: 10, lng: 20}, title: 'First'});
        expect(addedMarkers[1]).toMatchObject({id: 'm-2', mapId: 'gm-1', position: {lat: 30, lng: 40}, title: 'Second'});

        addedMarkers.length   = 0;
        destroyedCalls.length = 0;

        // Removing a record from markerStore triggers Store#onCollectionMutate -> 'load' -> onMarkerStoreLoad()
        map.markerStore.remove('m-1');

        expect(destroyedCalls).toHaveLength(1);
        expect(destroyedCalls[0]).toMatchObject({id: 'gm-1', mapId: 'gm-1'});
        expect(addedMarkers).toHaveLength(1);
        expect(addedMarkers[0]).toMatchObject({id: 'm-2', mapId: 'gm-1', position: {lat: 30, lng: 40}, title: 'Second'});

        map.destroy();
    });
});
