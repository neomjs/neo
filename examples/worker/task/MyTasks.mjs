import Base from '../../../src/core/Base.mjs';

/**
 * @class Neo.examples.worker.task.MyTasks
 * @extends Neo.core.Base
 * @singleton
 */
class MyTasks extends Base {
    static config = {
        /**
         * @member {String} className='Neo.examples.worker.task.MyTasks'
         * @protected
         */
        className: 'Neo.examples.worker.task.MyTasks',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'compute'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    compute(data) {
        console.log('compute', {
            data,
            workerId: Neo.workerId
        });

        return {success: true}
    }
}

export default Neo.setupClass(MyTasks);
