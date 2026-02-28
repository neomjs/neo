import Container                  from '../../../../src/container/Base.mjs';
import Controller                 from './MainContainerController.mjs';
import ControlsContainer          from './ControlsContainer.mjs';
import GridContainer              from './GridContainer.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import StatusToolbar              from './StatusToolbar.mjs';

/**
 * @class DevIndex.view.home.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.MainContainer'
         * @protected
         */
        className: 'DevIndex.view.home.MainContainer',
        /**
         * @member {String[]} baseCls=['devindex-home-maincontainer','neo-container']
         * @protected
         */
        baseCls: ['devindex-home-maincontainer', 'neo-container'],
        /**
         * @member {Neo.controller.Component} controller=Controller
         */
        controller: Controller,
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         */
        stateProvider: MainContainerStateProvider,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Container,
            cls      : ['devindex-grid-wrapper'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'grid-wrapper',
            items    : [{
                module   : GridContainer,
                bind     : {store: 'stores.contributors'},
                reference: 'grid',
                flex     : 1
            }, {
                module: StatusToolbar,
                bind     : {store: 'stores.contributors'},
                flex  : 'none'
            }]
        }, {
            module   : ControlsContainer,
            reference: 'controls'
        }]
    }
}

export default Neo.setupClass(MainContainer);
