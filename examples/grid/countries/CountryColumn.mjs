import CountryFlag from '../../../src/grid/column/CountryFlag.mjs';

/**
 * @summary The built-in `countryFlag` column over the economy's name: with `dataField: 'country'` the header sorts by
 * the name the cell shows, and the flag comes from the record's ISO code.
 *
 * `countryFlag` reads its flag code from `dataField`, which the header also sorts by, so a plain config would sort
 * Germany under "de". A name without an ISO code (the Channel Islands) shows no flag.
 * @class Neo.examples.grid.countries.CountryColumn
 * @extends Neo.grid.column.CountryFlag
 */
class CountryColumn extends CountryFlag {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.countries.CountryColumn'
         * @protected
         */
        className: 'Neo.examples.grid.countries.CountryColumn',
        /**
         * @member {String} contentField='country'
         */
        contentField: 'country'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {...super.applyRecordConfigs(config, record), countryCode: record.flag}
    }
}

export default Neo.setupClass(CountryColumn);
