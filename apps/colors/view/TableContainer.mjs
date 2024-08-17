import Container from '../../../src/table/Container.mjs';

/**
 * @class Colors.view.TableContainer
 * @extends Neo.table.Container
 */
class TableContainer extends Container {
    static config = {
        /**
         * @member {String} className='Colors.view.TableContainer'
         * @protected
         */
        className: 'Colors.view.TableContainer',
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
         * @member {String[]} cls=['colors-table-container']
         */
        cls: ['colors-table-container'],
        /**
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            renderer(data) {
                return {cls: ['color-' + data.value], html: ' '}
            }
        }
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
                    cls      : ['neo-index-column', 'neo-table-header-button'],
                    dataField: 'index',
                    dock     : 'left',
                    minWidth : 40,
                    text     : '#',
                    renderer : data => ({cls: ['neo-index-column', 'neo-table-cell'], html: data.index + 1}),
                    width    : 40
                }],
                currentChar;

            for (; i < value; i++) {
                currentChar = String.fromCharCode(startCharCode + i);

                columns.push({
                    dataField: 'column' + currentChar,
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
}

export default Neo.setupClass(TableContainer);
