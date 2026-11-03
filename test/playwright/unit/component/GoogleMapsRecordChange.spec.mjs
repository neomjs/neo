import {setup} from '../../setup.mjs';

const appName = 'GoogleMapsRecordChangeTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import                        '../../../../src/manager/Instance.mjs';
import GoogleMapsWrapper from '../../../../src/component/wrapper/GoogleMaps.mjs';

test.describe('Neo.component.wrapper.GoogleMaps markerStore recordChange listener', () => {
    let addedMarkers, originalAddon, removedMarkers;

    test.beforeEach(() => {
        addedMarkers   = [];
        removedMarkers = [];
        originalAddon  = Neo.main?.addon?.GoogleMaps;

        Neo.ns('Neo.main.addon', true);
        Neo.main.addon.GoogleMaps = {
            addMarker(data) {
                addedMarkers.push(data);
            },
            destroyMarkers() {},
            removeMap() {},
            removeMarker(data) {
                removedMarkers.push(data);
            }
        };
    });

    test.afterEach(() => {
        if (originalAddon) {
            Neo.main.addon.GoogleMaps = originalAddon;
        } else {
            delete Neo.main.addon.GoogleMaps;
        }
    });

    test('replaces the marker when a markerStore record mutates', () => {
        const map = Neo.create(GoogleMapsWrapper, {
            appName,
            id               : 'gm-rc-1',
            markerStoreConfig: {
                data: [
                    {id: 'm-1', position: {lat: 10, lng: 20}, title: 'Initial'}
                ]
            }
        });

        addedMarkers.length   = 0;
        removedMarkers.length = 0;

        const record = map.markerStore.get('m-1');
        record.set({
            position: {lat: 55, lng: 65},
            title   : 'Updated'
        });

        expect(removedMarkers).toHaveLength(1);
        expect(removedMarkers[0]).toMatchObject({id: 'm-1', mapId: 'gm-rc-1'});
        expect(addedMarkers).toHaveLength(1);
        expect(addedMarkers[0]).toMatchObject({
            id      : 'm-1',
            mapId   : 'gm-rc-1',
            position: {lat: 55, lng: 65},
            title   : 'Updated'
        });

        map.destroy();
    });
});
