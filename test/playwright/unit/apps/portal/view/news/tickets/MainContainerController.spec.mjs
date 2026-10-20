import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalTicketsControllerTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../../../src/core/_export.mjs';
import TicketsController from '../../../../../../../../apps/portal/view/news/tickets/MainContainerController.mjs';

/**
 * @summary `ensureRecordLoaded` trusts a loaded id map: an id the map does not name is no ticket, so it loads no
 * chunk folder. The folder-by-folder scan is for a map that could not be loaded.
 *
 * A `#N` that is a PR or Discussion number, or a URL with an unknown id, used to walk all of the index's chunk
 * folders one request at a time and then show nothing.
 */
function controllerWith({idMap}) {
    const folders = ['backlog', 'v13-0-0', 'v12-0-0'].map(id => ({childrenUrl: `${id}.json`, id, isChildrenLoaded: false, isLeaf: false})),
          items   = [...folders],
          loaded  = [],
          store   = {
              get     : id => items.find(item => item.id === id) || null,
              getCount: () => items.length,
              items
          },
          controller = Object.create(TicketsController.prototype);

    controller.getIdMap         = async () => idMap;
    controller.getStateProvider = () => ({data: {}, getStore: () => store});
    controller.getReference     = () => ({
        async onFolderItemClick(folder) {
            loaded.push(folder.id);
            folder.isChildrenLoaded = true;
            folder.id === 'v13-0-0' && items.push({id: '10074', isLeaf: true, parentId: folder.id})
        }
    });

    return {controller, loaded}
}

test.describe('Portal.view.news.tickets.MainContainerController#ensureRecordLoaded', () => {
    test('an id the loaded id map does not name loads no folder and resolves to null', async () => {
        const {controller, loaded} = controllerWith({idMap: {10074: 'v13-0-0'}});

        expect(await controller.ensureRecordLoaded('14422')).toBe(null);
        expect(loaded).toEqual([])
    });

    test('an id the map names loads exactly its folder', async () => {
        const {controller, loaded} = controllerWith({idMap: {10074: 'v13-0-0'}});

        expect((await controller.ensureRecordLoaded('10074'))?.id).toBe('10074');
        expect(loaded).toEqual(['v13-0-0'])
    });

    test('without a map, the folders are scanned until the id turns up', async () => {
        const {controller, loaded} = controllerWith({idMap: null});

        expect((await controller.ensureRecordLoaded('10074'))?.id).toBe('10074');
        expect(loaded).toEqual(['backlog', 'v13-0-0'])
    })
});
