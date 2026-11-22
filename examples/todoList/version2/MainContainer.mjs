import Button                  from '../../../src/button/Base.mjs';
import Component               from '../../../src/component/Base.mjs';
import Container               from '../../../src/container/Base.mjs';
import MainContainerController from './MainContainerController.mjs';
import StateProvider           from '../../../src/state/Provider.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import ThemeSwitcher           from '../../../src/button/ThemeSwitcher.mjs';
import TodoList                from './TodoList.mjs';
import TodoListStore           from './TodoListStore.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @summary The todo list every evaluator compares: add an item, check it off, filter by all, open and done, see what
 * is left, clear the done ones. The list binds a store of records, and the browser's storage keeps it across a reload.
 * @class Neo.examples.todoList.version2.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.todoList.version2.MainContainer'
         * @protected
         */
        className: 'Neo.examples.todoList.version2.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-todo']
         * @reactive
         */
        cls: ['neo-examples-todo'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-examples-todo-card'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},

            // Each part takes the height of its content, so the footer's buttons can wrap onto a second row on a phone
            items: [{
                module: Container,
                cls   : ['neo-examples-todo-header'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},

                items: [{
                    module: Component,
                    flex  : 1,
                    tag   : 'h1',
                    text  : 'Todos'
                }, {
                    module: ThemeSwitcher
                }]
            }, {
                module: Container,
                cls   : ['neo-examples-todo-entry'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},

                items: [{
                    module         : TextField,
                    flex           : 1,
                    hideLabel      : true,
                    labelText      : 'New item',
                    placeholderText: 'What needs doing?',
                    reference      : 'new-item'
                }, {
                    module : Button,
                    handler: 'onAddItem',
                    iconCls: 'fa fa-plus',
                    text   : 'Add'
                }]
            }, {
                module   : TodoList,
                bind     : {store: 'stores.todos'},
                flex     : 'none',
                reference: 'list'
            }, {
                module: Container,
                cls   : ['neo-examples-todo-footer'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

                // The filters choose a view, the commands change the list: two groups, the commands at the row's end
                items: [{
                    module: Component,
                    bind  : {text: data => `${data.openCount} ${data.openCount === 1 ? 'item' : 'items'} left`},
                    cls   : ['neo-examples-todo-count'],
                    flex  : 1
                }, {
                    module: Container,
                    cls   : ['neo-examples-todo-filters'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : ['All', 'Open', 'Done'].map(text => ({
                        module : Button,
                        bind   : {pressed: data => data.filter === text.toLowerCase()},
                        handler: 'onFilterClick',
                        text,
                        ui     : 'ghost'
                    }))
                }, {
                    module: Container,
                    cls   : ['neo-examples-todo-commands'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    items : [{
                        module : Button,
                        handler: 'onClearDone',
                        text   : 'Clear done',
                        ui     : 'ghost'
                    }, {
                        module : Button,
                        handler: 'onReset',
                        text   : 'Start over',
                        ui     : 'ghost'
                    }]
                }]
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'center'},
        /**
         * `filter` is the shown subset ('all', 'open' or 'done'); `openCount` counts the open items across all of
         * them.
         * @member {Object} stateProvider
         * @reactive
         */
        stateProvider: {
            module: StateProvider,
            data  : {filter: 'all', openCount: 0},
            stores: {todos: {module: TodoListStore}}
        }
    }
}

export default Neo.setupClass(MainContainer);
