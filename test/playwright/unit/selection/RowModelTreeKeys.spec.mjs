import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'RowModelTreeKeysTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import GridContainer    from '../../../../src/grid/Container.mjs';
import GridRowModel   from '../../../../src/selection/grid/RowModel.mjs';

/**
 * @summary ArrowRight expands and ArrowLeft collapses the selected parent row of a tree grid.
 *
 * Drives `Neo.selection.grid.RowModel` with a mock view, as RowModelKeypressClick.spec does. The grid container is
 * a plain object that borrows the real `Neo.grid.Container#toggleTreeNode`, so the spec covers the one method the
 * toggle icon and both keys share, together with the store call and the `expand` / `collapse` event it fires.
 */
class MockTreeStore extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Selection.RowModelTreeKeys.MockTreeStore'
    }

    calls   = [];
    records = {};

    collapse(record) {
        this.calls.push(['collapse', record.id]);
        record.collapsed = true
    }

    expand(record) {
        this.calls.push(['expand', record.id]);
        record.collapsed = false
    }

    get(id) {
        return this.records[id] || null
    }
}
MockTreeStore = Neo.setupClass(MockTreeStore);

class MockGridView extends Neo.core.Base {
    static observable = true;

    static config = {
        className          : 'Test.Unit.Selection.RowModelTreeKeys.MockGridView',
        selectedRecordField: 'selected'
    }

    bodies       = [];
    domListeners = [];

    getRecordId(record) {
        return record.id
    }
}
MockGridView = Neo.setupClass(MockGridView);

/**
 * @param {Object} opts
 * @param {Boolean} [opts.isTreeGrid=true]
 * @param {Boolean} [opts.canNavigate=true]
 * @returns {Object}
 */
function createFixture({isTreeGrid=true, canNavigate=true}={}) {
    const store   = Neo.create(MockTreeStore),
          folder  = {id: 'folder', collapsed: true,  isLeaf: false},
          open    = {id: 'open',   collapsed: false, isLeaf: false},
          leaf    = {id: 'leaf',   collapsed: true,  isLeaf: true},
          fired   = [],

          gridContainer = {
              fire          : (name, data) => fired.push({name, data}),
              isTreeGrid,
              on            : () => {},
              un            : () => {},
              store,
              toggleTreeNode: GridContainer.prototype.toggleTreeNode
          },

          view  = Neo.create(MockGridView, {gridContainer, store}),
          model = Neo.create(GridRowModel);

    Object.assign(store.records, {folder, open, leaf});

    ComponentManager.register(view);
    model.view        = view;
    model.canNavigate = () => canNavigate;

    return {fired, folder, leaf, model, open, store}
}

test.describe('Neo.selection.grid.RowModel: Left / Right keys on a tree grid row', () => {
    test('registers Left and Right beside Down and Up, and removes them again', () => {
        const {model} = createFixture(),
              keys    = [],
              view    = model.view;

        view.keys = {_keys: keys, removeKeys: items => items.forEach(item => {
            const idx = keys.findIndex(k => k.key === item.key);
            idx > -1 && keys.splice(idx, 1)
        })};

        model.register(view);

        expect(keys.map(k => k.key).sort()).toEqual(['Down', 'Left', 'Right', 'Up']);
        expect(keys.find(k => k.key === 'Left').fn).toBe('onKeyDownLeft');
        expect(keys.find(k => k.key === 'Right').fn).toBe('onKeyDownRight');

        model.unregister();
        expect(keys).toHaveLength(0)
    });

    test('AC-1: Right expands the selected collapsed parent and fires expand with {record}', () => {
        const {fired, folder, model, store} = createFixture();

        model.selectedRows = ['folder'];
        model.onKeyDownRight({});

        expect(store.calls).toEqual([['expand', 'folder']]);
        expect(folder.collapsed).toBe(false);
        expect(fired).toEqual([{name: 'expand', data: {record: folder}}]);
        expect(model.selectedRows).toEqual(['folder'])
    });

    test('AC-2: Left collapses the selected expanded parent and fires collapse with {record}', () => {
        const {fired, model, open, store} = createFixture();

        model.selectedRows = ['open'];
        model.onKeyDownLeft({});

        expect(store.calls).toEqual([['collapse', 'open']]);
        expect(open.collapsed).toBe(true);
        expect(fired).toEqual([{name: 'collapse', data: {record: open}}]);
        expect(model.selectedRows).toEqual(['open'])
    });

    test('AC-3: a leaf row, a row already in the requested state, no or many selected rows do nothing', () => {
        const {fired, model, store} = createFixture();

        model.selectedRows = ['leaf'];
        model.onKeyDownRight({});
        model.onKeyDownLeft({});

        model.selectedRows = ['folder'];
        model.onKeyDownLeft({});          // already collapsed

        model.selectedRows = ['open'];
        model.onKeyDownRight({});         // already expanded

        model.selectedRows = [];
        model.onKeyDownRight({});

        model.selectedRows = ['folder', 'open'];
        model.onKeyDownRight({});
        model.onKeyDownLeft({});

        expect(store.calls).toEqual([]);
        expect(fired).toEqual([]);
        expect(model.selectedRows).toEqual(['folder', 'open'])
    });

    test('AC-3: nothing happens in a grid without a tree store or while canNavigate() is false', () => {
        const flat = createFixture({isTreeGrid: false});

        flat.model.selectedRows = ['folder'];
        flat.model.onKeyDownRight({});
        expect(flat.store.calls).toEqual([]);
        expect(flat.fired).toEqual([]);

        const blocked = createFixture({canNavigate: false});

        blocked.model.selectedRows = ['folder'];
        blocked.model.onKeyDownRight({});
        blocked.model.selectedRows = ['open'];
        blocked.model.onKeyDownLeft({});
        expect(blocked.store.calls).toEqual([]);
        expect(blocked.fired).toEqual([])
    });

    test('AC-4: toggleTreeNode() without a direction toggles, as the toggle icon does', () => {
        const {fired, folder, model, store} = createFixture(),
              gridContainer = model.view.gridContainer;

        expect(gridContainer.toggleTreeNode(folder)).toBe(true);
        expect(gridContainer.toggleTreeNode(folder)).toBe(true);
        expect(store.calls).toEqual([['expand', 'folder'], ['collapse', 'folder']]);
        expect(fired.map(f => f.name)).toEqual(['expand', 'collapse']);

        expect(gridContainer.toggleTreeNode(null)).toBe(false);
        expect(gridContainer.toggleTreeNode({id: 'x', isLeaf: true, collapsed: true})).toBe(false)
    })
});
