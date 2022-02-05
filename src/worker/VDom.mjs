import Neo       from '../Neo.mjs';
import Base      from './Base.mjs';
import * as core from '../core/_export.mjs';
import Helper    from '../vdom/Helper.mjs';

/**
 * The Vdom worker converts vdom templates into vnodes, as well as creating delta-updates.
 * See the tutorials for further infos.
 * @class Neo.worker.VDom
 * @extends Neo.worker.Base
 * @singleton
 */
class VDom extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.VDom'
         * @protected
         */
        className: 'Neo.worker.VDom',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='vdom'
         * @protected
         */
        workerId: 'vdom'
    }}

    /**
     *
     */
    afterConnect() {
        let me      = this,
            channel = new MessageChannel(),
            port    = channel.port2;

        channel.port1.onmessage = me.onAppMessage.bind(me);

        me.sendMessage('app', {action: 'registerPort', transfer: port}, [port]);
    }

    /**
     * @param args
     */
    onAppMessage(...args) {
        console.log('message received from app worker', ...args);
        this.onMessage(...args);
    }
}

Neo.applyClassConfig(VDom);

let instance = Neo.create(VDom);

Neo.applyToGlobalNs(instance);

export default instance;
