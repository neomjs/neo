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
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            cls      : ['neo-index-column', 'neo-table-header-button'],
            dataField: 'index',
            dock     : 'left',
            minWidth : 40,
            text     : '#',
            renderer : data => ({cls : ['neo-index-column', 'neo-table-cell'], html: data.index + 1}),
            width    : 40
        }, {
            dataField: 'columnA',
            text     : 'A'
        }, {
            dataField: 'columnB',
            text     : 'B'
        }, {
            dataField: 'columnC',
            text     : 'C'
        }, {
            dataField: 'columnD',
            text     : 'D'
        }, {
            dataField: 'columnE',
            text     : 'E'
        }, {
            dataField: 'columnF',
            text     : 'F'
        }, {
            dataField: 'columnG',
            text     : 'G'
        }, {
            dataField: 'columnH',
            text     : 'H'
        }, {
            dataField: 'columnI',
            text     : 'I'
        }, {
            dataField: 'columnJ',
            text     : 'J'
        }]
    }
}

Neo.setupClass(TableContainer);

export default TableContainer;
