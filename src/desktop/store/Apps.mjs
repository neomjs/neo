import App       from '../model/App.mjs';
import TreeStore from '../../data/TreeStore.mjs';

/**
 * @summary A web desktop's apps, grouped: one store for its launcher and for every level of its start menu.
 *
 * The data is the catalog. The order of its rows is each app's catalog place, which an arrangement that does not name
 * the app gives it.
 *
 * Its sorter on `order` is the arrangement. A launcher's drag or {@link #arrange} writes `order`, and every view follows
 * the sort. A filter never touches `order`, so the apps it keeps stay in their places. The store brings no filter:
 * which apps show is the consumer's rule, e.g. a subclass's filter on a permission field of its model.
 * @class Neo.desktop.store.Apps
 * @extends Neo.data.TreeStore
 */
class Apps extends TreeStore {
    static config = {
        /**
         * @member {String} className='Neo.desktop.store.Apps'
         * @protected
         */
        className: 'Neo.desktop.store.Apps',
        /**
         * @member {Neo.data.Model} model=App
         */
        model: App,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            property             : 'order',
            reapplyOnRecordChange: true
        }]
    }

    /**
     * Each parent's child keys in catalog order. Root-level nodes live under 'root'.
     * @member {Map<String, Array>} #catalog=new Map()
     */
    #catalog = new Map()

    /**
     * Applies an arrangement as one batch. The apps it does not name take their catalog place.
     * @param {Object} [arrangement={}] Parent key → child keys, as {@link #getArrangement} returns them. A key the
     * catalog does not hold is ignored, and so is a value that is no array.
     */
    arrange(arrangement={}) {
        let me      = this,
            changes = [];

        me.#orderOf(arrangement).forEach((order, key) => {
            let record = me.get(key);

            record && record.order !== order && changes.push({key, values: {order}})
        });

        changes.length && me.updateRows(changes)
    }

    /**
     * Records the catalog from the rows and gives each row its catalog place as `order`. The rows are the config's
     * deep clone (`Neo.core.Config#clone`), so the data a consumer passes stays as it is.
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @returns {Object[]|null}
     * @protected
     */
    beforeSetData(value, oldValue) {
        value = super.beforeSetData(value, oldValue);

        if (Array.isArray(value)) {
            let me          = this,
                catalog     = me.#catalog,
                keyProperty = me.getKeyProperty(),
                order;

            catalog.clear();

            value.forEach(row => {
                let key       = row[keyProperty],
                    parentKey = row.parentId ?? 'root';

                catalog.has(parentKey) ? catalog.get(parentKey).push(key) : catalog.set(parentKey, [key])
            });

            order = me.#orderOf({});
            value.forEach(row => {row.order = order.get(row[keyProperty])})
        }

        return value
    }

    /**
     * @returns {Object} Parent key → child keys in the store's order, filtered-out apps included
     */
    getArrangement() {
        let me     = this,
            result = {};

        me.#catalog.forEach((keys, parentKey) => {
            result[parentKey] = me.getChildren(parentKey).map(record => me.getKey(record))
        });

        return result
    }

    /**
     * Each node's place among its siblings: the arrangement's order first, then the catalog's
     * @param {Object} arrangement Parent key → child keys
     * @returns {Map} Node key → order
     */
    #orderOf(arrangement) {
        let order = new Map();

        this.#catalog.forEach((keys, parentKey) => {
            let saved = arrangement[parentKey],
                named = Array.isArray(saved) ? [...new Set(saved)].filter(key => keys.includes(key)) : [];

            [...named, ...keys.filter(key => !named.includes(key))].forEach((key, index) => order.set(key, index))
        });

        return order
    }
}

export default Neo.setupClass(Apps);
