import Base     from './Base.mjs';
import CoreBase from '../core/Base.mjs';

/**
 * @class Neo.manager.Instance
 * @extends Neo.manager.Base
 * @singleton
 */
class Instance extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.Instance'
         * @private
         */
        className: 'Neo.manager.Instance',
        /**
         * @member {String} ntype='instance-manager'
         * @private
         */
        ntype: 'instance-manager',
        /**
         * @member {Boolean} singleton=true
         * @private
         */
        singleton: true
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        CoreBase.instanceManagerAvailable = true;

        me.consumeNeoIdMap();

        Neo.get = me.get.bind(me); // alias
    }

    /**
     * Register all ids which got applied to the Neo namespace before this instance got created
     * @private
     */
    consumeNeoIdMap() {
        if (Neo.idMap) {
            this.add(Object.values(Neo.idMap));
            delete Neo.idMap;
        }
    }
}

Neo.applyClassConfig(Instance);

let instance = Neo.create(Instance);

Neo.applyToGlobalNs(instance);

export default instance;