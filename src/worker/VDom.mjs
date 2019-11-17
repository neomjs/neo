import Neo       from '../Neo.mjs';
import * as core from '../core/_export.mjs';
import Helper    from '../vdom/Helper.mjs';
import NeoArray  from '../util/Array.mjs';
import Style     from '../util/Style.mjs';
import Worker    from './Worker.mjs';

/**
 * The Vdom worker converts vdom templates into vnodes, as well as creating delta-updates.
 * See the tutorials for further infos.
 * @class Neo.worker.VDom
 * @extends Neo.worker.Worker
 * @singleton
 */
class VDom extends Worker {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.VDom'
         * @private
         */
        className: 'Neo.worker.VDom',
        /**
         * @member {String} ntype='vdom-worker'
         * @private
         */
        ntype: 'vdom-worker',
        /**
         * @member {Boolean} singleton=true
         * @private
         */
        singleton: true,
        /**
         * @member {String} workerId='vdom'
         * @private
         */
        workerId: 'vdom'
    }}
}

Neo.applyClassConfig(VDom);

let instance = Neo.create(VDom);

Neo.applyToGlobalNs(instance);

export default instance;