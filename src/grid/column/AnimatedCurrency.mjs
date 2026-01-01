import AnimatedChange from './AnimatedChange.mjs';

/**
 * @class Neo.grid.column.AnimatedCurrency
 * @extends Neo.grid.column.AnimatedChange
 */
class AnimatedCurrency extends AnimatedChange {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.AnimatedCurrency'
         * @protected
         */
        className: 'Neo.grid.column.AnimatedCurrency',
        /**
         * @member {String} type='animatedCurrency'
         * @protected
         */
        type: 'animatedCurrency',
        /**
         * Set a different record field to base the change on.
         * Defaults this.dataField
         * @member {String|null} compareField=null
         */
        compareField: null,
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
    cellRenderer({column, value}) {
        if (value === null || value === undefined) {
            return ''
        }

        return column.formatter.format(value)
    }

    /**
     *
     */
    createFormatter() {
        let me = this;

        me.formatter = new Intl.NumberFormat(me.locale, {style: 'currency', currency: me.currency})
    }

    /**
     * Override as needed for dynamic record-based animation classes
     * @param {Record} record
     * @returns {String}
     */
    getAnimationCls(record) {
        return record[this.compareField || this.dataField] < 0 ? 'neo-animated-negative' : 'neo-animated-positive'
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            compareField: me.compareField,
            currency    : me.currency,
            locale      : me.locale
        }
    }
}

export default Neo.setupClass(AnimatedCurrency);
