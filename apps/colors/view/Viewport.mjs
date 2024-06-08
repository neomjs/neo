import BaseViewport       from '../../../src/container/Viewport.mjs';
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
            items : [{
                handler: 'onStartButtonClick',
                text   : 'Start'
            }, {
                handler: 'onStopButtonClick',
                style  : {marginLeft: '.5em'},
                text   : 'Stop'
            }, '->', {
                handler: 'onDetachTableButtonClick',
                iconCls: 'far fa-window-maximize',
                text   : 'Detach Table'
            }]
        }, {
            module   : TableContainer,
            bind     : {store: 'stores.colors'},
            height   : 300,
            reference: 'table'
        }, {
            module   : PieChartComponent,
            reference: 'pie-chart'
        }],
        /**
         * @member {Neo.model.Component} model=ViewportModel
         */
        model: ViewportModel
    }
}

Neo.setupClass(Viewport);

export default Viewport;
