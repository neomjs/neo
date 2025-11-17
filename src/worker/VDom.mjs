import Neo    from '../Neo.mjs';
import Base   from './Base.mjs';
import Helper from '../vdom/Helper.mjs';

/**
 * The Vdom worker converts vdom templates into vnodes, as well as creating delta-updates.
 * See the tutorials for further infos.
 * @class Neo.worker.VDom
 * @extends Neo.worker.Base
 * @singleton
 */
class VDom extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.VDom'
         * @protected
         */
        className: 'Neo.worker.VDom',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String} workerId='vdom'
     * @protected
     */
    workerId = 'vdom'

    /**
     *
     */
    afterConnect() {
        let me      = this,
            channel = new MessageChannel(),
            {port2} = channel;

        channel.port1.onmessage = me.onMessage.bind(me);

        me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2])
    }

    /**
     * @param {Object} msg
     * @param {Object} msg.data The Neo.config content
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        let config = msg.data;

        if (config.useSSR && config.idCounter) {
            Object.assign(Neo.core.IdGenerator.idCounter, config.idCounter);
            delete Neo.config.idCounter
        }
    }
}

export default Neo.setupClass(VDom);
