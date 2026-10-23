/**
 * @file test/playwright/unit/grid/LostScrollRestore.spec.mjs
 * @summary A grid whose DOM lost its scroll offsets gets the engine's position back on the next resize.
 *
 * A browser resets a scroll container's offsets when it stops being laid out (an inactive card) or moves in the
 * DOM, and fires no scroll event. The engine keeps the user's position, so the bodies render rows and columns the
 * viewport does not show. `grid.Container#onResize` reads both offsets after each delivery and writes the engine's
 * position back on an axis the DOM holds at the origin.
 *
 * @see Neo.grid.Container#restoreLostScroll
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridLostScrollRestoreTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.grid.Container: a DOM that lost its scroll offsets', () => {
    let grid, original, store;

    test.beforeEach(async () => {
        const data = [];

        for (let i = 0; i < 50; i++) {
            data.push({id: i, col1: `C1-${i}`, col2: `C2-${i}`, col3: `C3-${i}`, col4: `C4-${i}`})
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model      : {
                fields: [
                    {name: 'id',   type: 'Integer'},
                    {name: 'col1', type: 'String'},
                    {name: 'col2', type: 'String'},
                    {name: 'col3', type: 'String'},
                    {name: 'col4', type: 'String'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridLostScrollRestoreTest',
            height   : 400,
            width    : 300,
            store,
            rowHeight: 40,
            columns  : ['col1', 'col2', 'col3', 'col4'].map(dataField => ({dataField, text: dataField, width: 200}))
        });

        await grid.initVnode();
        grid.mounted = true;

        // The single-thread environment has no layout: model the three rects `passSizeToBody` measures (container,
        // header, view) and leave the header's own sizing out of this file's question
        grid.getLayoutRect = async () => [{height: 400, width: 300}, {height: 40, width: 300}, {height: 340, width: 300}];
        grid.headerToolbar.passSizeToBody = async () => {};

        Neo.main           ??= {};
        Neo.main.DomAccess ??= {};
        original = {getAttributes: Neo.main.DomAccess.getAttributes, scrollTo: Neo.main.DomAccess.scrollTo}
    });

    test.afterEach(async () => {
        Object.assign(Neo.main.DomAccess, original);
        await grid.timeout(20);
        grid.destroy();
        store.destroy()
    });

    /**
     * @summary Runs one unbuffered resize delivery against a DOM that holds the given offsets.
     * @param {Object} dom
     * @param {Number} dom.left The horizontal scrollbar's scrollLeft
     * @param {Number} dom.top  The view's scrollTop
     * @returns {Promise<{reads: Number, scrolls: Object[]}>}
     */
    async function resizeWith(dom) {
        const result = {reads: 0, scrolls: []};

        Neo.main.DomAccess.getAttributes = async ({id}) => {
            result.reads++;
            return id.map(entry => entry === grid.horizontalScrollbar.id ? {scrollLeft: dom.left, scrollTop: 0} : {scrollLeft: 0, scrollTop: dom.top})
        };
        Neo.main.DomAccess.scrollTo = data => result.scrolls.push(data);

        await GridContainer.prototype.onResize.call(grid, {borderBoxSize: {blockSize: 400, inlineSize: 300}});

        return result
    }

    test('an axis the DOM holds at the origin gets the engine\'s position back', async () => {
        Object.assign(grid.scrollManager, {scrollLeft: 500, scrollTop: 1200});

        expect((await resizeWith({left: 0, top: 0})).scrolls).toEqual([
            {direction: 'left', id: grid.horizontalScrollbar.id, value: 500,  windowId: grid.windowId},
            {direction: 'top',  id: grid.view.id,                value: 1200, windowId: grid.windowId}
        ])
    });

    test('controls: a DOM at the engine\'s position or away from the origin stays, and an engine at the origin reads nothing', async () => {
        Object.assign(grid.scrollManager, {scrollLeft: 500, scrollTop: 1200});

        expect((await resizeWith({left: 500, top: 1200})).scrolls, 'nothing was lost').toEqual([]);

        // A live horizontal scroll the engine has not echoed yet, and a lost vertical offset
        expect((await resizeWith({left: 320, top: 0})).scrolls).toEqual([
            {direction: 'top', id: grid.view.id, value: 1200, windowId: grid.windowId}
        ]);

        Object.assign(grid.scrollManager, {scrollLeft: 0, scrollTop: 0});

        expect(await resizeWith({left: 0, top: 0}), 'an engine at the origin has nothing to restore').toEqual({reads: 0, scrolls: []})
    })
});
