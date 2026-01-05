import BaseViewport          from '../../../src/container/Viewport.mjs';
import BarChartComponent     from './BarChartComponent.mjs';
import Dashboard             from '../../../src/dashboard/Container.mjs';
import DashboardPanel        from '../../../src/dashboard/Panel.mjs';
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
         * @member {String[]} cls=['colors-viewport','neo-dashboard']
         * @reactive
         */
        cls: ['colors-viewport', 'neo-dashboard'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
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
            module   : Dashboard,
            layout   : {ntype: 'vbox', align: 'stretch'},
            popupUrl : 'apps/colors/childapps/widget/index.html',
            reference: 'dashboard',
            sortGroup: 'neo-connected-dashboard',

            items: [{
                module   : DashboardPanel,
                flex     : 1,
                reference: 'grid-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Grid'
                }],
                items: [
                    {module: GridContainer, reference: 'grid'}
                ]
            }, {
                module   : DashboardPanel,
                flex     : 1.3,
                reference: 'pie-chart-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Pie Chart'
                }],
                items: [
                    {module: PieChartComponent, reference: 'pie-chart'}
                ]
            }, {
                module   : DashboardPanel,
                flex     : 1.3,
                reference: 'bar-chart-panel',
                headers  : [{
                    dock: 'top',
                    cls : ['neo-draggable'],
                    text: 'Bar Chart'
                }],
                items: [
                    {module: BarChartComponent, reference: 'bar-chart'}
                ]
            }],
        }],
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         * @reactive
         */
        stateProvider: ViewportStateProvider
    }
}

export default Neo.setupClass(Viewport);
