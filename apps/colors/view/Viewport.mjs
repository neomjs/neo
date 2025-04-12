import BaseViewport          from '../../../src/container/Viewport.mjs';
import BarChartComponent     from './BarChartComponent.mjs';
import HeaderToolbar         from './HeaderToolbar.mjs';
import PieChartComponent     from './PieChartComponent.mjs';
import GridContainer         from './GridContainer.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

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
            module: HeaderToolbar,
            flex  : 'none'
        }, {
            module   : GridContainer,
            reference: 'grid',
            wrapperStyle: {height: '600px'}
        }, {
            module   : PieChartComponent,
            reference: 'pie-chart'
        }, {
            module   : BarChartComponent,
            reference: 'bar-chart'
        }],
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider
    }
}

export default Neo.setupClass(Viewport);
