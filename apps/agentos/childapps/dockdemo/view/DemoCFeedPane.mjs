import GridContainer from '../../../../../src/grid/Container.mjs';

/**
 * @summary The second live Store<Model> pane: a capped, visibly growing event stream.
 *
 * @class AgentOS.childapps.dockdemo.view.DemoCFeedPane
 * @extends Neo.grid.Container
 */
class DemoCFeedPane extends GridContainer {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.DemoCFeedPane'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.DemoCFeedPane',
        /**
         * @member {Object} body
         */
        body: {bufferColumnRange: 1, bufferRowRange: 2},
        /**
         * @member {String[]} cls
         */
        cls: ['agentos-dockdemo-data-pane', 'agentos-dockdemo-feed-pane'],
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

export default Neo.setupClass(DemoCFeedPane);
