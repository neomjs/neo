import BaseViewport          from '../../../src/container/Viewport.mjs';
import GridContainer         from './GridContainer.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
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
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /*
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object} style
         */
        style: {padding: '1.5em'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            style : {marginBottom: '1.5em'},

            items : [{
                disabled : true,
                handler  : 'onStartButtonClick',
                reference: 'start-button',
                text     : 'Start'
            }, {
                handler  : 'onStopButtonClick',
                reference: 'stop-button',
                style    : {marginLeft: '.3em'},
                text     : 'Stop'
            }]
        }, {
            module   : GridContainer,
            reference: 'grid'
        }]
    }
}

export default Neo.setupClass(Viewport);
