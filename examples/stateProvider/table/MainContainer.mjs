import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import TableContainer             from '../../../src/table/Container.mjs';
import Viewport                   from '../../../src/container/Viewport.mjs';

/**
 * @class  Neo.examples.stateProvider.table.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.table.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.table.MainContainer',
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'fit'},
        /**
         * @member {Object|Neo.state.Provider} stateProvider=MainContainerStateProvider
         */
        stateProvider: MainContainerStateProvider,
        /**
         * @member {Object} style
         */
        style: {padding: '20px'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module      : TableContainer,
            width       : '100%',
            wrapperStyle: {height: '300px'},

            bind: {
                store: 'stores.main'
            },

            columns: [{
                dataField: 'firstname',
                text     : 'Firstname'
            }, {
                dataField: 'lastname',
                text     : 'Lastname'
            }, {
                dataField: 'githubId',
                text     : 'Github Id'
            }, {
                dataField: 'country',
                text     : 'Country'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
