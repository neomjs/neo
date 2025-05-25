import BaseViewport from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';

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
            ntype    : 'container',
            height   : 250,
            layout   : 'fit',
            reference: 'container',
            width    : 800
        }, {
            module : Button,
            handler: 'up.onLoadItemsButtonClick',
            style  : {marginTop: '1em'},
            text   : 'Load Grid Container'
        }]
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onLoadItemsButtonClick(data) {
        data.component.disabled = true;

        let response   = await fetch('../../examples/serverside/gridContainer/resources/data/grid-container.json'),
            remoteData = await response.json();

        if (remoteData.modules) {
            await Promise.all(remoteData.modules.map(module => import(module)))
        }

        this.getReference('container').add(remoteData.items)
    }
}

export default Neo.setupClass(Viewport);
