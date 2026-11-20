import {setup} from '../../../../../setup.mjs';

const appName = 'PortalExamplesListModelTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../../src/core/_export.mjs';
import ExamplesList      from '../../../../../../../apps/portal/view/examples/List.mjs';
import ExamplesListModel from '../../../../../../../apps/portal/view/examples/ListModel.mjs';
import ExamplesStore     from '../../../../../../../apps/portal/store/Examples.mjs';

const sampleRecords = [{
    browsers    : ['Chrome'],
    environments: ['dist_prod'],
    family      : 'board',
    feature     : 'Move cards across columns.',
    id          : 'board-sprint',
    image       : 'devmode/board-sprint-14.jpg',
    kind        : 'demo',
    lookFor     : 'Drag a card between lanes.',
    name        : 'Sprint Board',
    sourceUrl   : 'examples/board/sprint',
    urls        : {dist_prod: 'dist/production/examples/board/sprint/index.html'}
}, {
    browsers    : ['Chrome'],
    environments: ['dist_prod'],
    family      : 'gantt',
    feature     : 'Plan linked milestones.',
    id          : 'gantt-garden',
    image       : 'devmode/gantt-garden-14.jpg',
    kind        : 'demo',
    lookFor     : 'Shift a task bar.',
    name        : 'Community Garden Plan',
    sourceUrl   : 'examples/gantt/garden',
    urls        : {dist_prod: 'dist/production/examples/gantt/garden/index.html'}
}];

/**
 * @summary Verifies `Portal.view.examples.ListModel` owns card click selection while `List#getInteractiveItemIndex` stays shared.
 */
test.describe('Portal.view.examples.ListModel', () => {
    let list;

    function createList(config={}) {
        return list = Neo.create(ExamplesList, {
            appName,
            store: {module: ExamplesStore, autoLoad: false, data: structuredClone(sampleRecords)},
            ...config
        })
    }

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('preserves List#getInteractiveItemIndex for pointer delegates while installing ListModel', () => {
        createList();

        const firstId = list.getItemId(list.store.getAt(0));

        expect(list.selectionModel).toBeInstanceOf(ExamplesListModel);
        expect(list.getInteractiveItemIndex([
            {cls: ['preview-image'], id: `${firstId}__img`, tagName: 'div'},
            {cls: ['neo-list-item'], id: firstId,           tagName: 'li'}
        ])).toBe(1)
    });

    test('ignores wide mouse clicks, link clicks, and tile lists, while toggling touch and compact clicks', () => {
        createList();

        const model    = list.selectionModel,
              firstId  = list.getItemId(list.store.getAt(0)),
              secondId = list.getItemId(list.store.getAt(1)),
              cardPath = (id, width, innerTag='div') => [
                  {cls: [],                id: `${id}__inner`, tagName: innerTag},
                  {cls: ['neo-list-item'], id,                 tagName: 'li'},
                  {cls: ['neo-viewport'],  id: 'vp',           rect: {width}, tagName: 'div'}
              ];

        model.onListClick({currentTarget: firstId, path: cardPath(firstId, 1440), pointerType: 'mouse'});
        expect(model.getSelection()).toEqual([]);

        model.onListClick({currentTarget: firstId, path: cardPath(firstId, 390, 'a'), pointerType: 'touch'});
        expect(model.getSelection()).toEqual([]);

        model.onListClick({currentTarget: firstId, path: cardPath(firstId, 820), pointerType: 'touch'});
        expect(model.getSelection()).toEqual([firstId]);

        model.onListClick({currentTarget: secondId, path: cardPath(secondId, 390), pointerType: 'mouse'});
        expect(model.getSelection()).toEqual([secondId]);

        model.onListClick({currentTarget: secondId, path: cardPath(secondId, 390), pointerType: 'mouse'});
        expect(model.getSelection()).toEqual([]);

        list.tiles = true;
        model.onListClick({currentTarget: firstId, path: cardPath(firstId, 390), pointerType: 'touch'});
        expect(model.getSelection()).toEqual([])
    })
});
