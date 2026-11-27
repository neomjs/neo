import FloatingAction from '../../../src/button/FloatingAction.mjs';
import List           from '../../../src/list/Base.mjs';
import TaskStore      from './TaskStore.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const listId = 'floating-action-example-tasks';

/**
 * A phone screen with a long task list and two floating action buttons. The extended "New task" button collapses
 * to its icon while the list scrolls down. The icon-only filter button hides. Both come back on an upward scroll.
 * The list is created before the buttons, so each button resolves its `scrollTarget` id on construction.
 * @class Neo.examples.button.floatingAction.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.button.floatingAction.MainContainer'
         * @protected
         */
        className: 'Neo.examples.button.floatingAction.MainContainer',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                ntype    : 'label',
                cls      : ['neo-floating-action-example-title'],
                reference: 'title',
                text     : 'All tasks'
            }, '->', {
                module: ThemeSwitcher,
                ui    : 'secondary'
            }]
        }, {
            module      : List,
            cls         : ['neo-floating-action-example-tasks'],
            displayField: 'name',
            flex        : 1,
            id          : listId,
            reference   : 'tasks',
            store       : TaskStore,
            // The end padding keeps the last task clear of the buttons
            style       : {overflowY: 'auto', paddingBottom: '88px'}
        }, {
            module        : FloatingAction,
            handler       : 'up.onAddTask',
            iconCls       : 'fa fa-plus',
            scrollBehavior: 'collapse',
            scrollTarget  : listId,
            text          : 'New task'
        }, {
            module        : FloatingAction,
            extended      : false,
            handler       : 'up.onToggleFilter',
            iconCls       : 'fa fa-filter',
            position      : 'start',
            scrollBehavior: 'hide',
            scrollTarget  : listId,
            text          : 'Show open tasks'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Adds a task at the top of the list.
     */
    onAddTask() {
        let {store} = this.getItem('tasks'),
            id      = store.getCount() + 1;

        store.insert(0, {done: false, id, name: `Task ${id}`})
    }

    /**
     * Shows only open tasks, or all of them again. The title names the active filter, the button shows it even
     * while collapsed to its icon, and `pressed` tells assistive technology.
     * @param {Object} data
     */
    onToggleFilter(data) {
        let me       = this,
            {store}  = me.getItem('tasks'),
            filtered = !store.filters.length;

        me.getItem('title').text = filtered ? 'Open tasks' : 'All tasks';

        if (filtered) {
            store.filters = [{property: 'done', value: false}]
        } else {
            store.clearFilters()
        }

        data.component.set({
            iconCls: filtered ? 'fa fa-filter-circle-xmark' : 'fa fa-filter',
            pressed: filtered,
            text   : filtered ? 'Show all tasks' : 'Show open tasks'
        })
    }
}

export default Neo.setupClass(MainContainer);
