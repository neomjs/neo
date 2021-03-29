import BaseViewport   from '../../src/container/Viewport.mjs';
import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';
import MainContainer3 from './MainContainer3.mjs';

/**
 * @class Neo.examples.tablePerformance.Viewport
 * @extends Neo.container.Base
 */
class Viewport extends BaseViewport {
    static getConfig() {return {
        className: 'Neo.examples.tablePerformance.Viewport',
        autoMount: true,
        style    : {padding: '10px'},

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        items: [{
            module: MainContainer
        }, {
            module: MainContainer2,
            style: {marginTop: '20px'}
        }, {
            module: MainContainer3,
            style: {marginTop: '20px'}
        }]
    }}
}

Neo.applyClassConfig(Viewport);

export {Viewport as default};