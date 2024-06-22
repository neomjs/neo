import Base     from './Base.mjs';
import CoreBase from '../core/Base.mjs';

/**
 * @class Neo.manager.Instance
 * @extends Neo.manager.Base
 * @singleton
 */
class Instance extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.Instance'
         * @protected
         */
        className: 'Neo.manager.Instance',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        CoreBase.instanceManagerAvailable = true;

        me.consumeNeoIdMap();

        Neo.find      = me.find     .bind(me); // alias
        Neo.findFirst = me.findFirst.bind(me); // alias
        Neo.get       = me.get      .bind(me); // alias
    }

    /**
     * Register all ids which got applied to the Neo namespace before this instance got created
     * @protected
     */
    consumeNeoIdMap() {
        if (Neo.idMap) {
            this.add(Object.values(Neo.idMap));
            delete Neo.idMap
        }
    }
}

export default Neo.setupClass(Instance);
