import ComponentController from '../../../src/controller/Component.mjs';
import {startItems}        from './TodoListStore.mjs';

/**
 * @summary Adds, filters and clears the todo items, counts the open ones, and keeps the list in the browser's
 * storage, so a reload opens on the list as it was left.
 * @class Neo.examples.todoList.version2.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.todoList.version2.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.todoList.version2.MainContainerController'
    }

    /**
     * The key of the list in the browser's storage
     * @member {String} storageKey='neo-examples-todo-list'
     */
    storageKey = 'neo-examples-todo-list'

    /**
     * The id the next added item gets
     * @member {Number} nextId=1
     * @protected
     */
    nextId = 1

    /**
     * @summary The items across every filter, for counting and for storage.
     * @returns {Neo.data.Model[]}
     */
    getAllItems() {
        let store = this.getStore('todos');

        return store.isFiltered() ? store.allItems.items : store.items
    }

    /**
     * @summary Adds the typed item as open, then empties the field for the next one.
     */
    onAddItem() {
        let me    = this,
            field = me.getReference('new-item'),
            text  = field.value?.trim();

        if (text) {
            me.getStore('todos').add({done: false, id: me.nextId, text});
            field.value = ''
        }
    }

    /**
     * @summary Removes the done items.
     */
    onClearDone() {
        let me = this;

        me.getStore('todos').remove(me.getAllItems().filter(record => record.done))
    }

    /**
     * @summary Enter in the field adds the item, and the store's changes reach the count and the storage. The list
     * then loads from the storage, or opens on the start items on a first visit.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me    = this,
            store = me.getStore('todos');

        // A field registers its key navigation as it is constructed: Enter joins it here, handled by this controller
        me.getReference('new-item').keys.add({Enter: 'onAddItem', scope: me.id});

        store.on({load: me.onItemsChange, recordChange: me.onItemsChange, scope: me});

        Neo.main.addon.LocalStorage.readLocalStorageItem({key: me.storageKey, windowId: me.windowId}).then(({value}) => {
            store.data = value ? JSON.parse(value) : structuredClone(startItems)
        })
    }

    /**
     * @summary Shows all, the open or the done items.
     * @param {Object} data
     * @param {Neo.button.Base} data.component The pressed filter button
     */
    onFilterClick({component}) {
        let filter = component.text.toLowerCase();

        this.setState({filter});
        this.getStore('todos').filters = filter === 'all' ? [] : [{property: 'done', value: filter === 'done'}]
    }

    /**
     * @summary Counts the open items, notes the next free id, and writes the list to the browser's storage.
     */
    onItemsChange() {
        let me    = this,
            items = me.getAllItems().map(({done, id, text}) => ({done, id, text}));

        me.nextId = Math.max(0, ...items.map(item => item.id)) + 1;
        me.setState({openCount: items.filter(item => !item.done).length});

        Neo.main.addon.LocalStorage.updateLocalStorageItem({key: me.storageKey, value: JSON.stringify(items), windowId: me.windowId})
    }

    /**
     * @summary Forgets the stored list and opens on the start items again, unfiltered.
     */
    onReset() {
        let me    = this,
            store = me.getStore('todos');

        me.setState({filter: 'all'});
        store.filters = [];
        store.data    = structuredClone(startItems)
    }
}

export default Neo.setupClass(MainContainerController);
