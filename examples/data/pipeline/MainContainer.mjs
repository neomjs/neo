import BeatlesModel   from './BeatlesModel.mjs';
import ConnectionFetch from '../../../src/data/connection/Fetch.mjs';
import TabContainer   from '../../../src/tab/Container.mjs';
import Table          from '../../../src/table/Container.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.data.pipeline.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.data.pipeline.MainContainer',
        layout   : {ntype: 'fit'},
        style    : {padding: '20px'},

        items: [{
            module: TabContainer,
            items : [{
                module      : Table,
                reference   : 'table-app-worker',
                wrapperStyle: {height: '100%'},
                header: {
                    iconCls: 'fa fa-microchip',
                    text   : 'App Worker Pipeline'
                },
                store: {
                    autoLoad: true,
                    model   : BeatlesModel,
                    pipeline: {
                        workerExecution: 'app', // Default value, re-adding it here for clarity.
                        connection: {
                            module: ConnectionFetch,
                            url   : '../../../resources/data/theBeatles.json'
                        }
                    }
                },
                columns: [{
                    dataField: 'first',
                    text     : 'First Name'
                }, {
                    dataField: 'last',
                    text     : 'Last Name'
                }, {
                    dataField: 'dob',
                    text     : 'Date of Birth',
                    renderer : data => data.value ? Intl.DateTimeFormat('default').format(new Date(data.value)) : ''
                }]
            }, {
                module      : Table,
                reference   : 'table-data-worker',
                wrapperStyle: {height: '100%'},
                header: {
                    iconCls: 'fa fa-server',
                    text   : 'Data Worker Pipeline'
                },
                store: {
                    autoLoad: true,
                    model   : BeatlesModel,
                    pipeline: {
                        workerExecution: 'data',
                        connection: {
                            className: 'Neo.data.connection.Fetch',
                            url      : '../../../resources/data/theBeatles.json'
                        }
                    }
                },
                columns: [{
                    dataField: 'first',
                    text     : 'First Name'
                }, {
                    dataField: 'last',
                    text     : 'Last Name'
                }, {
                    dataField: 'dob',
                    text     : 'Date of Birth',
                    renderer : data => data.value ? Intl.DateTimeFormat('default').format(new Date(data.value)) : ''
                }]
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
