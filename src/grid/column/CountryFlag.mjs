import ComponentColumn      from './Component.mjs';
import CountryFlagComponent from '../../component/CountryFlag.mjs';

/**
 * @class Neo.grid.column.CountryFlag
 * @extends Neo.grid.column.Component
 */
class CountryFlag extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.CountryFlag'
         * @protected
         */
        className: 'Neo.grid.column.CountryFlag',
        /**
         * @member {String} contentField='location'
         */
        contentField: 'location',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: CountryFlagComponent
        },
        /**
         * @member {String} type='countryFlag'
         * @protected
         */
        type: 'countryFlag'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            countryCode: record[this.dataField],
            location   : record[this.contentField],
            ...config
        }
    }
}

export default Neo.setupClass(CountryFlag);
