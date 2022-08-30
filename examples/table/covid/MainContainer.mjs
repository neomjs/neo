import MainStore      from './MainStore.mjs';
import TableContainer from '../../../src/table/Container.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.table.covid.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.table.covid.MainContainer'
         * @protected
         */
        className: 'Neo.examples.table.covid.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Object[]} items
         */
        items: [{
            module:TableContainer,
            store : MainStore,

            columns: [
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {dataField: 'githubId',  text: 'Github Id'},
                {dataField: 'country',   text: 'Country'}
            ]
        }],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'fit'}
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
