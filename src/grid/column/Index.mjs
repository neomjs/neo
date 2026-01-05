import Column from './Base.mjs';

/**
 * @class Neo.grid.column.Index
 * @extends Neo.grid.column.Base
 */
class Index extends Column {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Index'
         * @protected
         */
        className: 'Neo.grid.column.Index',
        /**
         * @member {String} type='index'
         * @protected
         */
        type: 'index',
        /**
         * @member {Boolean} zeroBased=false
         */
        zeroBased: false
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
    cellRenderer({rowIndex}) {
        return rowIndex + (this.zeroBased ? 0 : 1)
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            zeroBased: this.zeroBased
        }
    }
}

export default Neo.setupClass(Index);
