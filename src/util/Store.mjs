import Base from '../core/Base.mjs';

/**
 * @summary Adapts container record payloads to store row batches without reading or hydrating stored rows.
 *
 * Grid and table containers share this adapter to preserve their whole-record update signature.
 * @class Neo.util.Store
 * @extends Neo.core.Base
 */
class Store extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Store'
         * @protected
         */
        className: 'Neo.util.Store'
    }

    /**
     * @summary Keeps declared, writable fields from whole-record updates, including nested field maps.
     * Keys identify the row but are never included in its values. Undeclared and calculated fields are ignored.
     * @param {Neo.data.Store} store
     * @param {Object[]} records
     * @returns {Object[]} Row edits for {@link Neo.data.Store#updateRows}
     */
    static toRowChanges(store, records) {
        const keyProperty = store.getKeyProperty(),
              {model}     = store;

        return records.map(record => {
            const values  = {},
                  collect = (data, prefix='') => {
                      Object.entries(data).forEach(([name, value]) => {
                          const path  = prefix + name,
                                field = model.getField(path);

                          if (field) {
                              if (path !== keyProperty && !field.calculate) values[path] = value
                          } else if (Neo.isObject(value)) {
                              collect(value, path + '.')
                          }
                      })
                  };

            collect(record);
            return {key: record[keyProperty], values}
        })
    }
}

export default Neo.setupClass(Store);
