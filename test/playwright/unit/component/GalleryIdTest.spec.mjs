import {setup} from '../../setup.mjs';

const appName = 'GalleryIdTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Gallery        from '../../../../src/component/Gallery.mjs';

test.describe('Gallery Internal IDs', () => {

    test('Gallery should assign stable IDs to internal structural nodes', async () => {
        const gallery = Neo.create(Gallery, {
            appName,
            id: 'my-gallery',
            // Mock store to avoid loading issues
            store: {
                getCount: () => 0,
                on: () => {},
                un: () => {},
                destroy: () => {}
            }
        });

        // The gallery structure is:
        // origin -> camera -> dolly -> view

        const origin = gallery.vdom.cn[0];
        const camera = origin.cn[0];
        const dolly  = camera.cn[0];
        const view   = dolly.cn[0];

        // Check if IDs are assigned
        expect(origin.id).toBe('my-gallery__origin');
        expect(camera.id).toBe('my-gallery__camera');
        expect(dolly.id).toBe('my-gallery__dolly');
        expect(view.id).toBe('my-gallery__view');

        gallery.destroy();
    });
});
