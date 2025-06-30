import BaseGridContainer from '../../../src/grid/Container.mjs';

/**
 * @class Colors.view.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='Colors.view.GridContainer'
         * @protected
         */
        className: 'Colors.view.GridContainer',
        /**
         * @member {Number|null} amountColumns_=null
         */
        amountColumns_: null,
        /**
         * @member {Number|null} amountRows_=null
         */
        amountRows_: null,
        /**
         * @member {Object} bind
         */
        bind: {
            amountColumns: data => data.amountColumns,
            amountRows   : data => data.amountRows,
            store        : 'stores.colors'
        },
        /**
         * @member {String[]} cls=['colors-grid-container']
         */
        cls: ['colors-grid-container']
    }

    /**
     * Triggered after the amountColumns config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        if (Neo.isNumber(value)) {
            let startCharCode = 'A'.charCodeAt(0),
                i             = 0,
                columns       = [{
                    cellAlign: 'right',
                    dataField: 'id',
                    text     : '#',
                    type     : 'index',
                    width    : 40
                }],
                currentChar;

            for (; i < value; i++) {
                currentChar = String.fromCharCode(startCharCode + i);

                columns.push({
                    dataField: 'column' + currentChar,
                    renderer : 'up.colorRenderer',
                    text     : currentChar
                })
            }

            this.columns = columns
        }
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        this.store?.clear()
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    colorRenderer({value}) {
        return {cls: ['color-' + value], text: ' '}
    }
}

export default Neo.setupClass(GridContainer);
