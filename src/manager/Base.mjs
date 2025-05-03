import Collection from '../collection/Base.mjs';

/**
 * Abstract base class for the other manager classes
 * @class Neo.manager.Base
 * @extends Neo.collection.Base
 */
class Manager extends Collection{
    static config = {
        /**
         * @member {String} className='Neo.manager.Base'
         * @protected
         */
        className: 'Neo.manager.Base'
    }

    /**
     * @param {Number|String} id
     * @returns {Object}
     */
    getById(id) {
        return id && this.get(id) || null
    }

    /**
     * @param {Object} item
     */
    register(item) {
        let me = this;

        if (me.get(item.id)) {
            Neo.logError('Trying to create an item with an already existing id', item, me.get(item.id))
        } else {
            me.push(item)
        }
    }

    /**
     * Removes a collection item passed by reference or key
     * @param {Object|String} item
     */
    unregister(item) {
        this.remove(item)
    }
}

export default Neo.setupClass(Manager);
