import Column from './Base.mjs';

/**
 * @class Neo.grid.column.Currency
 * @extends Neo.grid.column.Base
 */
class Currency extends Column {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Currency'
         * @protected
         */
        className: 'Neo.grid.column.Currency',
        /**
         * @member {String} type='currency'
         * @protected
         */
        type: 'currency',
        /**
         * @member {String} currency='USD'
         */
        currency: 'USD',
        /**
         * @member {String} locale='default'
         */
        locale: 'default'
    }

    /**
     * @member {Intl.NumberFormat|null} formatter=null
     */
    formatter = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.createFormatter()
    }

    /**
     * @param {Object}             data
     * @param {Neo.button.Base}    data.column
     * @param {Number}             data.columnIndex
     * @param {String}             data.dataField
     * @param {Neo.grid.Container} data.gridContainer
     * @param {Object}             data.record
     * @param {Number}             data.rowIndex
     * @param {Neo.data.Store}     data.store
     * @param {Number|String}      data.value
     * @returns {*}
     */
    cellRenderer({value}) {
        if (value === null || value === undefined) {
            return ''
        }

        return this.formatter.format(value)
    }

    /**
     *
     */
    createFormatter() {
        let me = this;

        me.formatter = new Intl.NumberFormat(me.locale, {style: 'currency', currency: me.currency})
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            currency: this.currency,
            locale  : this.locale
        }
    }
}

export default Neo.setupClass(Currency);
