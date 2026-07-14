import Record from '../model/Record.mjs';
import Store  from '../../../src/data/Store.mjs';

/**
 * @summary Workstation's target-owned 100,000-row scale store.
 *
 * This is the shipped BigData mechanism, localized rather than wrapped as another UI:
 * build plain objects, keep `autoInitRecords:false`, and add the complete set once in
 * Turbo Mode. Grid buffering and record hydration remain framework-owned.
 *
 * @class Workstation.store.Scale
 * @extends Neo.data.Store
 */
class Scale extends Store {
    static config = {
        /**
         * @member {String} className='Workstation.store.Scale'
         * @protected
         */
        className: 'Workstation.store.Scale',
        /**
         * @member {Number} amountRows=100000
         */
        amountRows: 100000,
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Record
         */
        model: Record
    }

    /**
     * Generates the exact scale set once. Random values deliberately match the existing
     * BigData precedent; this demo invents no seeded-data contract.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.items?.length) {
            this.add(this.generateData(this.amountRows), false)
        }
    }

    /**
     * @summary Creates compact renderer-rich rows for the scale pane.
     * @param {Number} amountRows
     * @returns {Object[]}
     */
    generateData(amountRows) {
        const
            names    = ['Atlas', 'Beacon', 'Cipher', 'Delta', 'Echo', 'Flux', 'Graph', 'Helix'],
            statuses = ['healthy', 'streaming', 'observed', 'queued'],
            records  = new Array(amountRows);

        for (let index = 0; index < amountRows; index++) {
            const base   = Math.round(Math.random() * 100);
            let   signal = 24 + index % 48;

            records[index] = {
                id      : index + 1,
                name    : `${names[index % names.length]} ${String(index + 1).padStart(6, '0')}`,
                status  : statuses[index % statuses.length],
                value   : Math.round(Math.random() * 10000),
                counter : base,
                progress: Math.round(Math.random() * 100),
                trend   : Array.from({length: 12}, (_, point) => {
                    signal = Math.max(8, Math.min(92, signal + ((index * 3 + point * 5) % 9) - 4));
                    return signal
                })
            }
        }

        return records
    }
}

export default Neo.setupClass(Scale);
