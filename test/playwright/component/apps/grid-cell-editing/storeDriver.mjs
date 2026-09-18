/**
 * @module test/playwright/component/apps/grid-cell-editing/storeDriver
 * @summary Drives `#grid-cell-editing-pooled`'s store from inside the App Worker: one operation per import, named by
 * the module's own `action` query parameter.
 *
 * A spec cannot sort or filter by pointer without ending the edit it wants to observe: a header click moves focus,
 * and focus leaving the editor commits. `Neo.worker.App.loadModule()` imports this module where the store lives, so
 * each operation runs in the order the spec asks for it. The caller adds a counter to the query, which makes every
 * call a new module URL, evaluated again.
 *
 * Every action targets record 3, the record the store-activity arms edit. `updateEdited` also writes `c4`, so the
 * row's repaint is visible while the edited cell itself shows the editor.
 */
const {searchParams} = new URL(import.meta.url),
      {store}        = Neo.getComponent('grid-cell-editing-pooled');

const actions = {
    clearFilter : () => store.clearFilters(),
    filterOut   : () => {store.filters = [{property: 'c3', operator: 'like', value: 'r1'}]},
    remove      : () => store.remove(3),
    sortAsc     : () => store.sort({property: 'id', direction: 'ASC'}),
    sortDesc    : () => store.sort({property: 'id', direction: 'DESC'}),
    updateEdited: () => store.get(3).set({c3: 'pushed', c4: 'pushed'}),
    updateOther : () => store.get(3).set({c4: 'pushed'})
};

actions[searchParams.get('action')]()
