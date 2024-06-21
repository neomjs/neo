import Base     from '../Base.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * @class Neo.manager.rpc.Message
 * @extends Neo.manager.Base
 * @singleton
 */
class Message extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.rpc.Message'
         * @protected
         */
        className: 'Neo.manager.rpc.Message',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            direction: 'ASC',
            property : 'id'
        }]
    }

    /**
     * Stores the urls of endpoints for which a setTimeout() call is in progress
     * @member {String[]} endPointTimeouts=[]
     */
    endPointTimeouts = []
    /**
     * internal incrementing flag
     * @member {Number} messageId=1
     * @protected
     */
    messageId = 1
    /**
     * Time window in ms for buffering incoming message requests
     * @member {Number} requestBuffer=20
     */
    requestBuffer = 20
    /**
     * @member {Object} socketConnections={}
     */
    socketConnections = {}
    /**
     * internal incrementing flag
     * @member {Number} transactionId=1
     * @protected
     */
    transactionId = 1

    /**
     *
     * @param {Object} msg
     * @returns {Promise<any>}
     */
    onMessage(msg) {
        let api = Neo.manager.rpc.Api.get(`${msg.service}.${msg.method}`);

        return this[`onMessage${Neo.capitalize(api.type)}`](msg, api);
    }

    /**
     *
     * @param {Object} msg
     * @param {Object} api
     * @protected
     * @returns {Promise<any>}
     */
    onMessageAjax(msg, api) {
        return new Promise((resolve, reject) => {
            let me    = this,
                {url} = api;

            me.register({
                id           : me.messageId,
                method       : msg.method,
                params       : msg.params,
                reject,
                resolve,
                service      : msg.service,
                transactionId: 0,
                url
            });

            me.messageId++;

            if (!me.endPointTimeouts.includes(url)) {
                me.endPointTimeouts.push(url);

                setTimeout(() => {
                    me.resolveBufferTimeout(url)
                }, me.requestBuffer)
            }
        })
    }

    /**
     *
     * @param {Object} msg
     * @param {Object} api
     * @protected
     * @returns {Promise<any>}
     */
    async onMessageWebsocket(msg, api) {
        let me         = this,
            {url}      = api,
            connection = me.socketConnections[url];

        if (!connection) {
            let module = await import('../../data/connection/WebSocket.mjs');

            me.socketConnections[url] = connection = Neo.create(module.default, {serverAddress: url})
        }

        return await connection.promiseMessage(msg)
    }

    /**
     * @param {String} url
     */
    async resolveBufferTimeout(url) {
        let me              = this,
            itemIds         = [],
            processItems    = me.find({transactionId: 0, url}),
            requests        = [],
            {transactionId} = me,
            response;

        processItems.forEach(item => {
            item.transactionId = transactionId;

            itemIds.push(item.id);

            requests.push({
                id     : item.id,
                method : item.method,
                params : item.params,
                service: item.service
            })
        });

        NeoArray.remove(me.endPointTimeouts, url);

        me.transactionId++;

        response = await Neo.Fetch.request(url, {}, 'post', JSON.stringify({tid: transactionId, requests}));

        processItems.forEach(item => {
            // todo: pass the item which is included inside the response object
            // todo: reject the Promise in case the item is missing

            item.resolve()
        });

        // todo: remove only the items which are included inside the response
        me.remove(itemIds)
    }
}

let instance = Neo.setupClass(Message);

export default instance;
