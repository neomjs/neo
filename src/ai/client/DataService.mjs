import Service      from './Service.mjs';
import StoreManager from '../../manager/Store.mjs';

/**
 * Handles data-related Neural Link requests.
 * @class Neo.ai.client.DataService
 * @extends Neo.ai.client.Service
 */
class DataService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.DataService'
         * @protected
         */
        className: 'Neo.ai.client.DataService'
    }

    /**
     * @param {Object} params
     * @param {String} params.recordId
     * @param {String} [params.storeId]
     * @returns {Object}
     */
    getRecord({recordId, storeId}) {
        let record;

        if (storeId) {
            const store = Neo.get(storeId);
            if (!store) throw new Error(`Store not found: ${storeId}`);
            record = store.get(recordId)
        } else {
            const matches = [];
            StoreManager.items.forEach(store => {
                const rec = store.get(recordId);
                if (rec) matches.push(rec)
            });

            if (matches.length > 1) {
                throw new Error(`Multiple records found with ID ${recordId}. Please specify storeId.`)
            } else if (matches.length === 1) {
                record = matches[0]
            }
        }

        if (!record) throw new Error(`Record not found: ${recordId}`);

        return record.toJSON()
    }

    /**
     * @param {Object} params
     * @param {String} params.providerId
     * @returns {Object}
     */
    inspectStateProvider({providerId}) {
        const provider = Neo.get(providerId);
        if (!provider) throw new Error(`StateProvider not found: ${providerId}`);

        return {
            id  : provider.id,
            data: provider.getHierarchyData()
        }
    }

    /**
     * @param {Object} params
     * @param {String} params.storeId
     * @returns {Object}
     */
    inspectStore({storeId}) {
        const store = Neo.get(storeId);
        if (!store) throw new Error(`Store not found: ${storeId}`);

        const items = [];
        const limit = Math.min(store.count, 50);

        for (let i = 0; i < limit; i++) {
            const record = store.getAt(i);
            if (record) {
                items.push(record.toJSON())
            }
        }

        return {
            id     : store.id,
            count  : store.count,
            model  : store.model?.className || 'N/A',
            filters: store.exportFilters?.() || [],
            sorters: store.exportSorters?.() || [],
            items
        }
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    listStores(params) {
        return {
            stores: StoreManager.items.map(s => ({
                id      : s.id,
                model   : s.model?.className || 'N/A',
                count   : s.count,
                isLoaded: s.isLoaded
            }))
        }
    }

    /**
     * @param {Object} params
     * @param {Object} params.data
     * @param {String} params.providerId
     * @returns {Object}
     */
    modifyStateProvider({data, providerId}) {
        const provider = Neo.get(providerId);
        if (!provider) throw new Error(`StateProvider not found: ${providerId}`);

        provider.setData(data);
        return {success: true}
    }
}

export default Neo.setupClass(DataService);
