import IdGenerator from '../core/IdGenerator.mjs';

/**
 * A wrapper for worker post messages sent between the App, Data, VDom worker & the main thread.
 * You can add optional params as needed.
 * @class Neo.worker.Message
 */
class Message {
    /**
     *
     * @param config
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

        Object.assign(this, config);
    }
}

const ns = Neo.ns('Neo.worker', true);
ns['Message'] = Message;

export {Message as default};