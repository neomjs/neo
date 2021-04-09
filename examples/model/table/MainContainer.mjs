import MainStore      from './MainStore.mjs';
import TableContainer from '../../../src/table/Container.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class  Neo.examples.model.table.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.model.table.MainContainer',
        autoMount: true,
        layout   : {ntype: 'fit'},
        style    : {padding: '20px'},

        items: [{
            module        : TableContainer,
            id            : 'myTableStoreContainer',
            store         : MainStore,
            width         : '100%',
            wrapperStyle  : {height: '300px'},

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
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};