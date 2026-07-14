import GridContainer from '../../../src/grid/Container.mjs';

/**
 * @summary The second live Store<Model> pane: a capped, visibly growing event stream.
 *
 * @class Workstation.view.FeedPane
 * @extends Neo.grid.Container
 */
class FeedPane extends GridContainer {
    static config = {
        /**
         * @member {String} className='Workstation.view.FeedPane'
         * @protected
         */
        className: 'Workstation.view.FeedPane',
        /**
         * @member {Object} body
         */
        body: {bufferColumnRange: 1, bufferRowRange: 2},
        /**
         * @member {String[]} cls
         */
        cls: ['workstation-data-pane', 'workstation-feed-pane'],
        /**
         * @member {Object} columnDefaults
         */
        columnDefaults: {cellAlign: 'left'},
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'timestamp',
            text     : 'Time',
            width    : 105
        }, {
            dataField: 'name',
            flex     : 2,
            text     : 'Event',
            minWidth : 280
        }, {
            dataField: 'status',
            flex     : 1,
            text     : 'State',
            minWidth : 140
        }, {
            type     : 'animatedChange',
            dataField: 'value',
            flex     : 1,
            text     : 'Value',
            minWidth : 120
        }, {
            type     : 'sparkline',
            dataField: 'trend',
            text     : 'Live',
            width    : 160
        }],
        /**
         * @member {Number} rowHeight=50
         */
        rowHeight: 50
    }
}

export default Neo.setupClass(FeedPane);
