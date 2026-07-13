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
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'timestamp',
            text     : 'Time',
            width    : 105
        }, {
            dataField: 'name',
            text     : 'Event',
            width    : 180
        }, {
            dataField: 'status',
            text     : 'State',
            width    : 105
        }, {
            type     : 'animatedChange',
            dataField: 'value',
            text     : 'Value',
            width    : 95
        }, {
            type     : 'sparkline',
            dataField: 'trend',
            flex     : 1,
            minWidth : 150,
            text     : 'Live'
        }],
        /**
         * @member {Number} rowHeight=42
         */
        rowHeight: 42
    }
}

export default Neo.setupClass(DemoCFeedPane);
