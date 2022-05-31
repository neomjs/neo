import Container from '../../src/container/Base.mjs';
import Dashboard from '../../src/dashboard/Container.mjs';
import Viewport  from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.dashboard.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.dashboard.MainContainer',
        autoMount: true,
        layout   : {ntype: 'fit'},
        style    : {padding: '10px'},

        items: [{
            module: Dashboard,

            itemDefaults: {
                module: Container
            },

            items : [{
                style: {backgroundColor: 'blue'}
            }, {
                style: {backgroundColor: 'darkgreen'}
            }, {
                style: {backgroundColor: 'red'}
            }, {
                style: {backgroundColor: 'darkblue'}
            }, {
                style: {backgroundColor: 'orange'}
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
