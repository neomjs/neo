import IdGenerator from '../core/IdGenerator.mjs';

/**
 * A wrapper for worker post messages sent between the App, Data, VDom worker & the main thread.
 * You can add optional params as needed.
 * @class Neo.worker.Message
 */
class Message {
    /**
     * @summary Identifies the two helper calls whose replies carry an updated VNode tree to App.
     * @param {Object} request
     * @returns {Boolean}
     */
    static isVdomUpdate({remoteClassName, remoteMethod}) {
        return remoteClassName === 'Neo.vdom.Helper' && (remoteMethod === 'updateBatch' || remoteMethod === 'update')
    }

    /**
     * @param {Object} config
     */
    constructor(config) {
        /**
         * @member {String} action
         */

        /**
         * @member {String} destination='main'
         */

        /**
         * @member {String} id=IdGenerator.getId(Neo.workerId)
         */

        /**
         * @member {String} origin=Neo.workerId
         */

        config.destination = config.destination || 'main';
        config.id          = config.id          || IdGenerator.getId(Neo.workerId);
        config.origin      = config.origin      || Neo.workerId;

        Object.assign(this, config)
    }
}

const ns = Neo.ns('Neo.worker', true);
ns['Message'] = Message;

export default Message;
