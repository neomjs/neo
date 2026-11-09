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
     * @summary Removes a collection item passed by key, or by reference while it still holds its key's registration.
     * A retired item whose key a successor reused (e.g. a released Model) leaves the successor registered.
     * @param {Object|String} item
     */
    unregister(item) {
        let me = this;

        if (item === null || typeof item !== 'object' || me.get(me.getKey(item)) === item) {
            me.remove(item)
        }
    }
}

export default Neo.setupClass(Manager);
