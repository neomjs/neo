import Grid from '../../../src/grid/Container.mjs';

/**
 * @class Legit.view.CommitGrid
 * @extends Neo.grid.Container
 */
class CommitGrid extends Grid {
    static config = {
        /**
         * @member {String} className='Legit.view.CommitGrid'
         * @protected
         */
        className: 'Legit.view.CommitGrid',
        /**
         * @member {String[]} baseCls=['legit-commit-grid','neo-grid-container']
         * @protected
         */
        baseCls: ['legit-commit-grid', 'neo-grid-container'],
        /**
         * @member {Object} bind={store:'stores.commitStore'}
         */
        bind: {store: 'stores.commitStore'},
        /**
         * @member {Object} columnDefaults={renderer:'onCommitColumnRenderer'}
         */
        columnDefaults: {
            renderer: 'onCommitColumnRenderer'
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'timestamp',
            text     : 'Timestamp',
            width    : 150
        }, {
            dataField: 'author',
            text     : 'Author',
            width    : 150
        }, {
            dataField: 'message',
            text     : 'Message',
            flex     : 1
        }, {
            dataField: 'oid',
            text     : 'OID',
            width    : 300
        }]
    }
}

export default Neo.setupClass(CommitGrid);
