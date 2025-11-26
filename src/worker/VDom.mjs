import Neo  from '../Neo.mjs';
import Base from './Base.mjs';

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
     * We need to ensure that the global Neo.config is set before importing the vdom Helper.
     * Otherwise, the Helper.initAsync() method might use the wrong default values.
     * This is critical for Neo.config.useDomApiRenderer === false, as it would otherwise load the
     * wrong renderer utility (DomApiVnodeCreator instead of StringFromVnode).
     * See: https://github.com/neomjs/neo/issues/7907
     * @param {Object} msg The incoming message object.
     * @param {Object} msg.data The initial global Neo.config data object.
     * @param {String} msg.data.windowId The unique ID of the window/tab.
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);
        import('../vdom/Helper.mjs')
    }
}

export default Neo.setupClass(VDom);
