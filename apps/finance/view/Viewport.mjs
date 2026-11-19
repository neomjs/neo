import BaseViewport          from '../../../src/container/Viewport.mjs';
import GridContainer         from './GridContainer.mjs';
import Label                 from '../../../src/component/Label.mjs';
import SearchField           from '../../../src/form/field/Search.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @summary Responsive Finance market desk viewport pairing a live-search status toolbar with the equity grid.
 * @class Finance.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Finance.view.Viewport'
         * @protected
         */
        className: 'Finance.view.Viewport',
        /**
         * @member {String[]} cls=['finance-viewport']
         * @reactive
         */
        cls: ['finance-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['finance-toolbar'],
            flex  : 'none',
            layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'start', wrap: 'wrap'},
            items : [{
                module: Label,
                cls   : ['finance-title'],
                text  : 'Nasdaq-100 Live Market Desk'
            }, {
                module              : SearchField,
                cls                 : ['finance-search'],
                clearToOriginalValue: false,
                flex                : '1 1 260px',
                listeners           : {change: 'onSearchChange'},
                placeholderText     : 'Filter symbol, company or sector…',
                reference           : 'search-field'
            }, {
                module   : Label,
                bind     : {text: data => data.statusText},
                cls      : ['finance-status'],
                reference: 'status-label'
            }, {
                disabled : true,
                handler  : 'onStartButtonClick',
                iconCls  : 'fa fa-play',
                reference: 'start-button',
                text     : 'Start'
            }, {
                handler  : 'onStopButtonClick',
                iconCls  : 'fa fa-pause',
                reference: 'stop-button',
                text     : 'Stop'
            }]
        }, {
            module   : GridContainer,
            reference: 'grid'
        }]
    }
}

export default Neo.setupClass(Viewport);
