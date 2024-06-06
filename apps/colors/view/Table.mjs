import Container   from '../../../src/table/Container.mjs';

/**
 * @class Colors.view.Table
 * @extends Neo.table.Container
 */
class Table extends Container {
    static config = {
        /**
         * @member {String} className='Colors.view.Table'
         * @protected
         */
        className: 'Colors.view.Table',
        /**
         * @member {String[]} cls=['colors-table']
         */
        cls: ['colors-table'],
        /**
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            minWidth: 80,
            renderer(data) {
                return {cls: 'color-' + data.value}
            }
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
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

Neo.setupClass(Table);

export default Table;
