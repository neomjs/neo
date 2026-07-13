import Button        from '../../../../../src/button/Base.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';

/**
 * @summary Renderer-rich virtual grid for Demo C's exact 100,000-row scale store.
 *
 * The pane composes the generic column families proven by BigData and DevIndex: viewport-
 * bounded row/column pools, ordinary renderers, component cells, animated values, progress,
 * heatmap classes, and `type:'sparkline'` (the framework-owned OffscreenCanvas path).
 *
 * @class AgentOS.childapps.dockdemo.view.DemoCScalePane
 * @extends Neo.grid.Container
 */
class DemoCScalePane extends GridContainer {
    static config = {
        /**
         * @member {String} className='AgentOS.childapps.dockdemo.view.DemoCScalePane'
         * @protected
         */
        className: 'AgentOS.childapps.dockdemo.view.DemoCScalePane',
        /**
         * @member {Object} body
         */
        // The choreography can grow this pane by 28% of the 1440px reference scene in
        // one structural update. Ten 50px rows keep that bounded expansion covered while
        // Grid's resize buffer catches up, without rendering beyond the viewport pool.
        body: {bufferColumnRange: 2, bufferRowRange: 10},
        /**
         * @member {String[]} cls
         */
        cls: ['agentos-dockdemo-data-pane', 'agentos-dockdemo-scale-pane'],
        /**
         * @member {Object} columnDefaults
         */
        columnDefaults: {cellAlign: 'left', width: 130},
        /**
         * @member {Object[]} columns
         */
        columns: [{
            type     : 'index',
            dataField: 'id',
            text     : '#',
            width    : 70
        }, {
            dataField: 'name',
            text     : 'Work item',
            width    : 190
        }, {
            dataField: 'status',
            text     : 'State',
            width    : 120
        }, {
            dataField: 'value',
            text     : 'Throughput',
            renderer : ({value}) => new Intl.NumberFormat().format(value),
            cellCls  : ({value}) => ['agentos-dockdemo-heat', `agentos-dockdemo-heat-${Math.min(3, Math.floor((value || 0) / 2500))}`]
        }, {
            type     : 'animatedChange',
            dataField: 'counter',
            text     : 'Pulse'
        }, {
            type     : 'progress',
            dataField: 'progress',
            text     : 'Load',
            width    : 150
        }, {
            type     : 'sparkline',
            dataField: 'trend',
            text     : 'Living signal',
            width    : 160
        }, {
            type     : 'component',
            // A unique column data key is required even though the component acts on the full
            // record. Reusing `counter` would alias the AnimatedChange column's pooled cells.
            dataField: 'timestamp',
            text     : 'Action',
            width    : 130,
            component: ({record}) => ({
                module : Button,
                cls    : ['agentos-dockdemo-row-action'],
                handler: () => record.counter++,
                iconCls: 'fa fa-wave-square',
                text   : '+1 pulse'
            })
        }],
        /**
         * @member {Number} rowHeight=50
         */
        rowHeight: 50
    }
}

export default Neo.setupClass(DemoCScalePane);
