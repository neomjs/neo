import BaseViewport       from '../../../src/container/Viewport.mjs';
import BarChartComponent  from './BarChartComponent.mjs';
import PieChartComponent  from './PieChartComponent.mjs';
import TableContainer     from './TableContainer.mjs';
import Toolbar            from '../../../src/toolbar/Base.mjs';
import ViewportController from './ViewportController.mjs';
import ViewportModel      from './ViewportModel.mjs';

/**
 * @class Colors.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Colors.view.Viewport'
         * @protected
         */
        className: 'Colors.view.Viewport',
        /**
         * @member {String[]} cls=['colors-viewport']
         */
        cls: ['colors-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['portal-header-toolbar'],
            flex  : 'none',

            items: [{
                handler: 'onStartButtonClick',
                text   : 'Start'
            }, {
                handler: 'onStopButtonClick',
                text   : 'Stop'
            }, '->', {
                handler  : 'onDetachBarChartButtonClick',
                iconCls  : 'far fa-window-maximize',
                reference: 'detach-bar-chart-button',
                text     : 'Detach Bar Chart'
            }, {
                handler  : 'onDetachPieChartButtonClick',
                iconCls  : 'far fa-window-maximize',
                reference: 'detach-pie-chart-button',
                text     : 'Detach Pie Chart'
            }, {
                handler  : 'onDetachTableButtonClick',
                iconCls  : 'far fa-window-maximize',
                reference: 'detach-table-button',
                text     : 'Detach Table'
            }]
        }, {
            module   : TableContainer,
            bind     : {store: 'stores.colors'},
            height   : 300,
            reference: 'table'
        }, {
            module   : PieChartComponent,
            reference: 'pie-chart'
        }, {
            module   : BarChartComponent,
            reference: 'bar-chart'
        }],
        /**
         * @member {Neo.model.Component} model=ViewportModel
         */
        model: ViewportModel
    }
}

Neo.setupClass(Viewport);

export default Viewport;
