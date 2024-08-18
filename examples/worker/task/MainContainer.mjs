import Button   from '../../../src/button/Base.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

/**
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
         * @member {Object} layout={ntype:'vbox'}
         */
        layout: {ntype: 'vbox'},
        /**
         * @member {Array} items
         */
        items: [{
            module: Button,
            text  : 'Execute in Task Worker',

            handler: async data => {
                console.log('Button click');

                delete data.component; // we can not pass neo instances to other workers

                const response = await Neo.examples.worker.task.MyTasks.compute(data);

                console.log({
                    response,
                    workerId: Neo.workerId
                })
            }
        }],
        /**
         * @member {Object} style={padding:'5em'}
         */
        style: {padding: '5em'}
    }
}

export default Neo.setupClass(MainContainer);
