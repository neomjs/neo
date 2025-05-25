import BaseViewport from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';
import Toolbar      from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.serverside.gridContainer.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.serverside.gridContainer.Viewport',
        cls      : ['neo-serverside-gridContainer-viewport'],
        layout   : 'base',

        items: [{
            module   : Toolbar,
            reference: 'toolbar'
        }, {
            module : Button,
            handler: 'up.onLoadItemsButtonClick',
            style  : {marginTop: '1em'},
            text   : 'Load Toolbar Items'
        }]
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onLoadItemsButtonClick(data) {
        data.component.disabled = true;

        let response   = await fetch('../../examples/serverside/gridContainer/resources/data/toolbar-items.json'),
            remoteData = await response.json();

        this.getReference('toolbar').add(remoteData.items)
    }
}

export default Neo.setupClass(Viewport);
