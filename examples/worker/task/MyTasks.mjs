import Base        from '../../../src/core/Base.mjs';
import countPrimes from './countPrimes.mjs';

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
     * @summary Counts one inclusive range on the Task Worker and identifies the worker that executed it.
     * @param {Object} data
     * @param {Number} data.first
     * @param {Number} data.last
     * @returns {Object}
     */
    compute({first, last}) {
        return {count: countPrimes(first, last), workerId: Neo.workerId}
    }
}

export default Neo.setupClass(MyTasks);
