import List      from '../../../src/list/Base.mjs';
import MainStore from './MainStore.mjs';
import Viewport  from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.list.animate.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.list.animate.MainContainer',
        autoMount: true,
        layout   : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module      : List,
            animate     : true,
            displayField: 'firstname',
            store       : MainStore
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
