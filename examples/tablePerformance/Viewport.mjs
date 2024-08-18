import BaseViewport   from '../../src/container/Viewport.mjs';
import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';
import MainContainer3 from './MainContainer3.mjs';

/**
 * @class Neo.examples.tablePerformance.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.tablePerformance.Viewport',
        style    : {overflow: 'hidden', padding: '10px'},

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        items: [{
            module: MainContainer
        }, {
            module: MainContainer2,
            style : {marginTop: '20px'}
        }, {
            module: MainContainer3,
            style : {marginTop: '20px'}
        }]
    }
}

export default Neo.setupClass(Viewport);
