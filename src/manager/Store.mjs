import Manager from './Base.mjs';

/**
 * @class Neo.manager.Store
 * @extends Neo.manager.Base
 * @singleton
 */
class Store extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.Store'
         * @protected
         */
        className: 'Neo.manager.Store',
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
        
        // Alias Neo.getStore to this manager?
        // Neo.getStore = this.get.bind(this);
    }
}

export default Neo.setupClass(Store);
