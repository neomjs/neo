import ApiModel from '../model/Api.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Docs.app.store.Api
 * @extends Neo.data.Store
 */
class Api extends Store {
    static config = {
        /**
         * @member {String} className='Docs.app.store.Api'
         * @protected
         */
        className: 'Docs.app.store.Api',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=ApiModel
         * @reactive
         */
        model: ApiModel,
        /**
         * Restricts a sourceId projection to this generated root; null retains the complete index.
         * @member {String|null} rootName=null
         */
        rootName: null,
        /**
         * @member {String} url='../../docs/output/structure.json'
         */
        url: '../../docs/output/structure.json'
    }

    /** @summary Installs the root predicate on navigation projections only. */
    onConstructed() {
        super.onConstructed();
        if (this.rootName) {
            this.filters = [...this.filters, {filterBy: this.filterByRoot, scope: this, value: this.rootName}]
        }
    }

    /**
     * @summary Excludes records outside one complete generated root, retaining every matching ancestor.
     * @param {Object} data
     * @param {Object} data.item
     * @param {String} data.value Root folder name.
     * @returns {Boolean} True to exclude the record.
     */
    filterByRoot({item, value}) {
        const source = this.getSource();

        while (item && item.parentId !== null) {
            item = source.get(item.parentId)
        }

        return !item || item.name !== value
    }
}

export default Neo.setupClass(Api);
