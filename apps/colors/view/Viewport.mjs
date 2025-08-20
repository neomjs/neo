import BaseViewport          from '../../../src/container/Viewport.mjs';
import BarChartComponent     from './BarChartComponent.mjs';
import HeaderToolbar         from './HeaderToolbar.mjs';
import PieChartComponent     from './PieChartComponent.mjs';
import GridContainer         from './GridContainer.mjs';
import Panel                 from '../../../src/container/Panel.mjs';
import SortZone              from '../../../src/draggable/container/SortZone.mjs';
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
         * @reactive
         */
        cls: ['colors-viewport'],
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
         * @member {Boolean} sortable_=true
         */
        sortable_: true,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: HeaderToolbar,
            flex  : 'none'
        }, {
            module: Panel,
            flex  : 1,
            reference: 'grid-panel',
            headers: [{
                dock: 'top',
                cls : ['neo-draggable'],
                text: 'Grid'
            }],
            items: [
                {module: GridContainer, reference: 'grid'}
            ]
        }, {
            module   : Panel,
            flex     : 1.3,
            reference: 'pie-chart-panel',
            headers: [{
                dock: 'top',
                cls : ['neo-draggable'],
                text: 'Pie Chart'
            }],
            items: [
                {module: PieChartComponent, reference: 'pie-chart'}
            ]
        }, {
            module   : Panel,
            flex     : 1.3,
            reference: 'bar-chart-panel',
            headers: [{
                dock: 'top',
                cls : ['neo-draggable'],
                text: 'Bar Chart'
            }],
            items: [
                {module: BarChartComponent, reference: 'bar-chart'}
            ]
        }],
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         * @reactive
         */
        stateProvider: ViewportStateProvider
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        if (this.sortable) {
            this.dragZone = Neo.create({
                module             : SortZone,
                owner              : this,
                boundaryContainerId: this.id
            });
        }
    }
}

export default Neo.setupClass(Viewport);
