import {setup} from '../../../../../../setup.mjs';

const appName = 'PortalNewsVideosListTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import List           from '../../../../../../../../apps/portal/view/news/videos/List.mjs';
import Videos         from '../../../../../../../../apps/portal/store/Videos.mjs';

const videos = JSON.parse(fs.readFileSync(
    path.resolve(import.meta.dirname, '../../../../../../../../apps/portal/resources/data/videos.json'), 'utf8'
));

/**
 * @summary The Videos tab's data contract and facade rule: the shipped catalog loads newest first with every field
 * the list renders, a facade loads no player, and only the active film renders the nocookie embed.
 */
test.describe('Portal.view.news.videos.List', () => {
    let list;

    /**
     * @param {Object[]} data
     * @returns {Portal.view.news.videos.List}
     */
    function createList(data=videos) {
        return list = Neo.create(List, {
            appName,
            store: {module: Videos, autoLoad: false, data}
        })
    }

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('the shipped videos.json loads newest first, every entry complete', () => {
        const {store} = createList(),
              ids     = new Set();

        expect(store.getCount()).toBe(videos.length);

        store.forEach((record, index) => {
            expect(ids.has(record.id), `id ${record.id} is unique`).toBe(false);
            ids.add(record.id);

            expect(record.youtubeId, record.name).toMatch(/^[\w-]{11}$/);
            expect(Object.keys(List.productNames), record.name).toContain(record.product);
            expect(list.formatDate(record.date), `${record.name} has a valid date`).not.toBe('');
            expect(record.name && record.description, `${record.id} has a title and a description`).toBeTruthy();

            // The id sorter stands in for the chronology, so a newer film needs a higher id
            index > 0 && expect(record.date <= store.getAt(index - 1).date, `${record.name} is not newer than its predecessor`).toBe(true)
        })
    });

    test('a facade renders the lazy preview and no player; the active film alone renders the nocookie embed', () => {
        createList();

        const [first, second] = [list.store.getAt(0), list.store.getAt(1)],
              facade          = list.createItemContent(first)[0].cn[0],
              image           = facade.cn[0],
              keys            = Object.keys(image);

        expect(facade.tag).toBe('button');
        expect(image.src).toBe(`https://i.ytimg.com/vi/${first.youtubeId}/hqdefault.jpg`);
        expect(image.loading).toBe('lazy');
        // The DOM renderer applies attributes in key order: a src set before loading starts the fetch eagerly
        expect(keys.indexOf('loading')).toBeLessThan(keys.indexOf('src'));

        list.activeId = first.id;

        const player = list.createItemContent(first)[0].cn[0];

        expect(player.tag).toBe('iframe');
        expect(player.src).toBe(`https://www.youtube-nocookie.com/embed/${first.youtubeId}?autoplay=1`);
        expect(list.createItemContent(second)[0].cn[0].tag).toBe('button');

        list.activeId = second.id;

        expect(list.createItemContent(first)[0].cn[0].tag).toBe('button');
        expect(list.createItemContent(second)[0].cn[0].tag).toBe('iframe')
    });

    test('a thumbnail field overrides the YouTube preview', () => {
        createList([{...videos[0], thumbnail: 'https://example.org/preview.jpg'}]);

        expect(list.createItemContent(list.store.getAt(0))[0].cn[0].cn[0].src).toBe('https://example.org/preview.jpg')
    });

    test('the search highlights its matches and stops a film it hides', () => {
        createList();

        const playing = list.store.getAt(0);

        list.activeId = playing.id;
        list.store.getFilter('name').value = 'grid';

        expect(list.store.getCount()).toBe(videos.filter(video => /grid/i.test(video.name)).length);
        expect(list.activeId, 'the hidden film stopped').toBeNull();
        expect(list.createNameNodes('Buffered Grid: Vertical Scroll Pinning')).toEqual([
            {vtype: 'text', text: 'Buffered '},
            {tag: 'span', cls: ['neo-highlight-search'], text: 'Grid'},
            {vtype: 'text', text: ': Vertical Scroll Pinning'}
        ]);

        list.store.getFilter('name').value = null;

        expect(list.store.getCount()).toBe(videos.length);
        expect(list.activeId, 'clearing the search does not restart the film').toBeNull()
    })
});
