import BaseManager from './Base.mjs';

/**
 * @class Neo.manager.ClassHierarchy
 * @extends Neo.manager.Base
 * @singleton
 */
class ClassHierarchy extends BaseManager {
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
        this.consumeTempMap()
    }

    /**
     * Register all classes that got applied to the Neo namespace before this instance got created
     * @protected
     */
    consumeTempMap() {
        this.add(Object.values(Neo.classHierarchyMap));
        delete Neo.classHierarchyMap
    }

    /**
     * Both params represent classNames.
     *
     * Example use cases:
     * - isA('Neo.button.Menu',    'Neo.button.Base')    => true
     * - isA('Neo.button.Base',    'Neo.button.Menu')    => false
     * - isA('Neo.button.Base',    'Neo.component.Base') => true
     * - isA('Neo.component.Base', 'Neo.core.Base')      => true
     * @param {String} descendant
     * @param {String} ancestor
     * @returns {Boolean}
     */
    isA(descendant, ancestor) {
        if (descendant === ancestor) {
            return true
        }

        let parent = descendant;

        while (parent = this.get(parent)?.parentClassName) {console.log(parent);
            if (parent === ancestor) {
                return true
            }

            // Assumption: component.Base directly extends core.Base
            if (parent === 'Neo.component.Base' && ancestor !== 'Neo.core.Base') {
                return false
            }

            if (parent === 'Neo.core.Base') {
                return false
            }
        }

        // Cover wrong inputs
        return false
    }
}

export default Neo.setupClass(ClassHierarchy);
