import Button                  from '../../../src/button/Base.mjs';
import Component               from '../../../src/component/Base.mjs';
import Container               from '../../../src/container/Base.mjs';
import Label                   from '../../../src/component/Label.mjs';
import MainContainerController from './MainContainerController.mjs';
import Progress                from '../../../src/component/Progress.mjs';
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
         * @member {Object} listeners
         */
        listeners: {mounted: 'onMounted'},
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
            text  : 'Run the same prime count in each worker. Watch the heartbeat and try typing during each run.'
        }, {
            module: Container,
            cls   : ['neo-task-worker-lanes'],
            flex  : 1,
            layout: null,
            items : [
                {name: 'Task Worker', prefix: 'task', handler: 'onRunTaskButtonClick'},
                {name: 'App Worker', prefix: 'app', handler: 'onRunAppButtonClick'}
            ].map(({name, prefix, handler}) => ({
                module: Container,
                cls   : ['neo-task-worker-card', 'neo-task-worker-lane'],
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    module: Component,
                    tag   : 'h2',
                    text  : name
                }, {
                    module   : Button,
                    flex     : 'none',
                    handler,
                    reference: `${prefix}-run`,
                    text     : `Run in ${name}`
                }, {
                    module   : Progress,
                    labelText: 'Numbers checked',
                    reference: `${prefix}-progress`,
                    value    : 0
                }, {
                    module   : Label,
                    cls      : ['neo-task-worker-result'],
                    reference: `${prefix}-result`,
                    role     : 'status',
                    text     : 'Ready to count primes up to 16,000,000.'
                }, {
                    module   : Label,
                    cls      : ['neo-task-worker-readout'],
                    reference: `${prefix}-clock`,
                    text     : 'App Worker updates during job: —'
                }]
            }))
        }, {
            module: Container,
            cls   : ['neo-task-worker-card'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module   : Progress,
                cls      : ['neo-task-worker-heartbeat'],
                labelText: 'App Worker heartbeat',
                reference: 'heartbeat',
                value    : 0
            }, {
                module         : Text,
                cls            : ['neo-task-worker-input'],
                labelPosition  : 'top',
                labelText      : 'Type while the job runs',
                listeners      : {change: 'onInputChange'},
                placeholderText: 'Try typing during either run',
                reference      : 'input'
            }, {
                module   : Label,
                cls      : ['neo-task-worker-readout'],
                reference: 'echo',
                text     : 'App Worker received 0 characters.'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
