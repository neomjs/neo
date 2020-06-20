import Neo       from '../Neo.mjs';
import Base      from './Base.mjs';
import * as core from '../core/_export.mjs';
import Helper    from '../vdom/Helper.mjs';
import NeoArray  from '../util/Array.mjs';
import Style     from '../util/Style.mjs';

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
         * @member {String} ntype='vdom-worker'
         * @protected
         */
        ntype: 'vdom-worker',
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
}

Neo.applyClassConfig(VDom);

let instance = Neo.create(VDom);

Neo.applyToGlobalNs(instance);

export default instance;