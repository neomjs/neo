import Manager from './Base.mjs';

/**
 * @class Neo.manager.ClassHierarchy
 * @extends Neo.manager.Base
 * @singleton
 */
class Instance extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.ClassHierarchy'
         * @protected
         */
        className: 'Neo.manager.ClassHierarchy',
        /**
         * @member {String} keyProperty='className'
         * @protected
         */
        keyProperty: 'className',
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
        this.consumeNeoClassHierarchyMap()
    }

    /**
     * Register all classes that got applied to the Neo namespace before this instance got created
     * @protected
     */
    consumeNeoClassHierarchyMap() {
        this.add(Object.values(Neo.classHierarchyMap));
        delete Neo.classHierarchyMap
    }
}

export default Neo.setupClass(Instance);
