import {setup} from '../../setup.mjs';

const appName = 'CarouselLessThanThreeItemsUnitTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';
import {fileURLToPath} from 'node:url';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Carousel       from '../../../../src/component/Carousel.mjs';
import Store          from '../../../../src/data/Store.mjs';

const carouselCssPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../resources/css/src/component/Carousel.css'
);

/**
 * @summary Verifies `Neo.component.Carousel` rendering, rotation, `itemClick`, and dynamic store mutations
 * with 1, 2, and 3+ items.
 */
test.describe('Neo.component.Carousel (< 3 items & dynamic mutations)', () => {
    let carousel;

    function createCarousel(data) {
        return Neo.create(Carousel, {
            appName,
            itemCls: 'test-carousel-item',
            itemTpl: record => [{cls: 'quote', text: record.quote}],
            store  : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',    type: 'Int'},
                        {name: 'quote', type: 'String'}
                    ]
                },
                data
            }
        })
    }

    test.afterEach(() => {
        carousel?.destroy();
        carousel = null
    });

    test('renders 1 item centered in neo-carousel-translate-x-0, hides nav buttons, and ignores rotation', () => {
        carousel = createCarousel([{id: 1, quote: 'Only one'}]);

        const btnBar   = carousel.vdom.cn[0].cn[0],
              itemRoot = carousel.vdom.cn[0].cn[1];

        expect(btnBar.removeDom).toBe(true);
        expect(itemRoot.cn).toHaveLength(1);
        expect(itemRoot.cn[0].recordIndex).toBe(0);
        expect(itemRoot.cn[0].cls[0]).toBe('neo-carousel-translate-x-0');
        expect(carousel.itemIndex).toBe(0);

        carousel.onCarouselBtnClick('forward');
        expect(itemRoot.cn).toHaveLength(1);
        expect(itemRoot.cn[0].cls[0]).toBe('neo-carousel-translate-x-0');

        let clickedRecord = null;
        carousel.on('itemClick', record => {
            clickedRecord = record
        });
        carousel.onItemClick();
        expect(clickedRecord.quote).toBe('Only one')
    });

    test('renders 2 items, toggles the centered item on forward/back, and supports dynamic store removal and addition', () => {
        carousel = createCarousel([
            {id: 1, quote: 'First'},
            {id: 2, quote: 'Second'}
        ]);

        const btnBar   = carousel.vdom.cn[0].cn[0],
              itemRoot = carousel.vdom.cn[0].cn[1];

        expect(btnBar.removeDom).toBeUndefined();
        expect(itemRoot.cn).toHaveLength(2);
        expect(carousel.itemIndex).toBe(1);
        expect(itemRoot.cn[0].cls[0]).toBe('neo-carousel--translate-x-full');
        expect(itemRoot.cn[1].cls[0]).toBe('neo-carousel-translate-x-0');

        carousel.onCarouselBtnClick('forward');
        expect(carousel.itemIndex).toBe(0);
        expect(itemRoot.cn[0].cls[0]).toBe('neo-carousel-translate-x-0');
        expect(itemRoot.cn[1].cls[0]).toBe('neo-carousel--translate-x-full');

        carousel.onCarouselBtnClick('back');
        expect(carousel.itemIndex).toBe(1);
        expect(itemRoot.cn[0].cls[0]).toBe('neo-carousel-translate-x-full');
        expect(itemRoot.cn[1].cls[0]).toBe('neo-carousel-translate-x-0');

        // Remove an item on the fly -> drops to 1 centered item and hides nav buttons
        carousel.store.remove(carousel.store.get(2));
        expect(itemRoot.cn).toHaveLength(1);
        expect(itemRoot.cn[0].recordIndex).toBe(0);
        expect(itemRoot.cn[0].cls[0]).toBe('neo-carousel-translate-x-0');
        expect(btnBar.removeDom).toBe(true);

        // Add two items on the fly -> grows to 3 items and restores nav buttons
        carousel.store.add([
            {id: 2, quote: 'Second'},
            {id: 3, quote: 'Third'},
            {id: 4, quote: 'Fourth'}
        ]);

        expect(itemRoot.cn).toHaveLength(3);
        expect(btnBar.removeDom).toBeUndefined();
        expect(carousel.itemIndex).toBe(1);

        // Rotate forward twice across 4 items without itemIndex going negative
        carousel.onCarouselBtnClick('forward');
        expect(carousel.itemIndex).toBe(2);
        carousel.onCarouselBtnClick('forward');
        expect(carousel.itemIndex).toBe(3);

        let clickedRecord = null;
        carousel.on('itemClick', record => {
            clickedRecord = record
        });
        carousel.onItemClick();
        expect(clickedRecord.quote).toBe('Fourth');

        // Rotate backward across 4 items
        carousel.onCarouselBtnClick('back');
        expect(carousel.itemIndex).toBe(2);

        // Clear all items -> 0 items rendered and nav buttons hidden
        carousel.store.clear();
        expect(itemRoot.cn).toHaveLength(0);
        expect(carousel.itemData).toEqual({});
        expect(btnBar.removeDom).toBe(true)
    });

    test('handles fresh empty config, initial ready empty Store, and replacing a populated Store with a ready empty Store', async () => {
        const storeModel = {
            fields: [
                {name: 'id',    type: 'Int'},
                {name: 'quote', type: 'String'}
            ]
        };

        // 1. Fresh empty store config
        carousel = createCarousel([]);
        await carousel.store.ready();

        const btnBar   = carousel.vdom.cn[0].cn[0],
              itemRoot = carousel.vdom.cn[0].cn[1];

        expect(carousel.store.getCount()).toBe(0);
        expect(itemRoot.cn).toHaveLength(0);
        expect(carousel.itemData).toEqual({});
        expect(btnBar.removeDom).toBe(true);
        carousel.destroy();

        // 2. Initial binding of an already-ready empty Store
        const initialReadyEmptyStore = Neo.create(Store, {
            keyProperty: 'id',
            model      : storeModel,
            data       : []
        });
        await initialReadyEmptyStore.ready();

        carousel = Neo.create(Carousel, {
            appName,
            itemCls: 'test-carousel-item',
            itemTpl: record => [{cls: 'quote', text: record.quote}],
            store  : initialReadyEmptyStore
        });

        expect(carousel.store.getCount()).toBe(0);
        expect(carousel.vdom.cn[0].cn[1].cn).toHaveLength(0);
        expect(carousel.itemData).toEqual({});
        expect(carousel.vdom.cn[0].cn[0].removeDom).toBe(true);
        carousel.destroy();

        // 3. Populated Store replaced with an already-ready empty Store
        const populatedStore = Neo.create(Store, {
            keyProperty: 'id',
            model      : storeModel,
            data       : [
                {id: 1, quote: 'A'},
                {id: 2, quote: 'B'}
            ]
        });
        await populatedStore.ready();

        const replacementReadyEmptyStore = Neo.create(Store, {
            keyProperty: 'id',
            model      : storeModel,
            data       : []
        });
        await replacementReadyEmptyStore.ready();

        carousel = Neo.create(Carousel, {
            appName,
            itemCls: 'test-carousel-item',
            itemTpl: record => [{cls: 'quote', text: record.quote}],
            store  : populatedStore
        });

        expect(carousel.vdom.cn[0].cn[1].cn).toHaveLength(2);
        expect(Object.keys(carousel.itemData)).toEqual(['0', '1']);
        expect(carousel.vdom.cn[0].cn[0].removeDom).toBeUndefined();

        carousel.store = replacementReadyEmptyStore;

        expect(carousel.store.getCount()).toBe(0);
        expect(carousel.vdom.cn[0].cn[1].cn).toHaveLength(0);
        expect(carousel.itemData).toEqual({});
        expect(carousel.vdom.cn[0].cn[0].removeDom).toBe(true)
    })
});

test.describe('Neo.component.Carousel sizing', () => {
    let carousel;

    test.afterEach(() => {
        carousel?.destroy();
        carousel = null
    });

    test('AC-1: only the root carries neo-carousel, the body has its own class', () => {
        carousel = Neo.create(Carousel, {
            appName,
            itemCls: 'test-carousel-item',
            itemTpl: record => [{cls: 'quote', text: record.quote}],
            store  : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',    type: 'Int'},
                        {name: 'quote', type: 'String'}
                    ]
                },
                data: [{id: 1, quote: 'A'}, {id: 2, quote: 'B'}]
            }
        });

        const root = carousel.vdom,
              body = root.cn[0];

        expect(root.cls).toContain('neo-carousel');
        expect(body.cls).toContain('neo-carousel-body');
        expect(body.cls).not.toContain('neo-carousel');
        expect(body.cn[1].cls).toContain('neo-carousel-inner')
    });

    test('AC-2: the body, inner area and slides grow with the root instead of a fixed 9rem', () => {
        const css = fs.readFileSync(carouselCssPath, 'utf8');

        expect(css).toMatch(/\.neo-carousel\s*\{[^}]*display\s*:\s*flex/);
        expect(css).toMatch(/\.neo-carousel\s*\{[^}]*flex-direction\s*:\s*column/);
        expect(css).toMatch(/\.neo-carousel-body\s*\{[^}]*flex\s*:\s*1 1 auto/);
        expect(css).toMatch(/\.neo-carousel-inner\s*\{[^}]*flex\s*:\s*1 1 auto/);
        expect(css).toMatch(/\.neo-carousel-item\s*\{[^}]*height\s*:\s*100%/);
        expect(css).not.toMatch(/\.neo-carousel-inner\s*\{[^}]*height\s*:\s*9rem/)
    })
});
