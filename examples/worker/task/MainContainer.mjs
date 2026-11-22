import Button                  from '../../../src/button/Base.mjs';
import Component               from '../../../src/component/Base.mjs';
import Container               from '../../../src/container/Base.mjs';
import Label                   from '../../../src/component/Label.mjs';
import MainContainerController from './MainContainerController.mjs';
import Progress                from '../../../src/component/Progress.mjs';
import Switch                  from '../../../src/form/field/Switch.mjs';
import Text                    from '../../../src/form/field/Text.mjs';
import ThemeSwitcher           from '../../../src/button/ThemeSwitcher.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @summary Compares how the same calculation affects the UI in two different workers.
 * @class Neo.examples.worker.task.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.worker.task.MainContainer'
         * @protected
         */
        className: 'Neo.examples.worker.task.MainContainer',
        /**
         * @member {String[]} cls=['neo-task-worker-example']
         */
        cls: ['neo-task-worker-example'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-task-worker-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Component,
                flex  : 1,
                tag   : 'h1',
                text  : 'Heavy work off the UI'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module: Component,
            flex  : 'none',
            tag   : 'p',
            text  : 'Run the calculation and type below. Then switch workers and try again.'
        }, {
            module: Container,
            cls   : ['neo-task-worker-card'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Container,
                cls   : ['neo-task-worker-actions'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap', gap: '12px'},
                items : [{
                    module   : Button,
                    handler  : 'onRunButtonClick',
                    reference: 'run',
                    text     : 'Count primes',
                    ui       : 'primary'
                }, {
                    module   : Switch,
                    labelText: 'Use App Worker',
                    reference: 'useAppWorker'
                }]
            }, {
                module   : Progress,
                labelText: 'Numbers checked',
                reference: 'progress',
                value    : 0
            }, {
                module   : Label,
                reference: 'result',
                role     : 'status',
                text     : 'Ready to count primes up to 16,000,000.'
            }]
        }, {
            module: Container,
            cls   : ['neo-task-worker-card'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module       : Text,
                labelPosition: 'top',
                labelText    : 'Type while the job runs',
                listeners    : {change: 'onInputChange'}
            }, {
                module   : Label,
                reference: 'echo',
                text     : 'App Worker received 0 characters.'
            }, {
                module   : Label,
                reference: 'clock',
                text     : 'App Worker timer starts with the job.'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
