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
     * Memoizes the return values of isA() calls
     * @member {Map} isAQueryMap=new Map()
     * @protected
     */
    isAQueryMap = new Map()

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

        let parent        = descendant,
            {isAQueryMap} = this,
            queryName     = `${descendant},${ancestor}`,
            returnValue   = false;

        if (isAQueryMap.has(queryName)) {
            return isAQueryMap.get(queryName)
        }

        while (parent = this.get(parent)?.parentClassName) {
            if (parent === ancestor) {
                returnValue = true;
                break
            }

            // Assumption: component.Base directly extends core.Base
            if (parent === 'Neo.component.Base' && ancestor !== 'Neo.core.Base') {
                returnValue = false;
                break
            }

            if (parent === 'Neo.core.Base') {
                returnValue = false;
                break
            }
        }

        isAQueryMap.set(queryName, returnValue);

        return returnValue
    }
}

export default Neo.setupClass(ClassHierarchy);
