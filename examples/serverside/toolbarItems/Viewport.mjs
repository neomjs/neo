import BaseViewport from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';
import Toolbar      from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.serverside.toolbarItems.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.serverside.toolbarItems.Viewport',
        cls      : ['neo-serverside-toolbaritems-viewport'],
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

        let items = await this.loadItems({url: '../../examples/serverside/toolbarItems/resources/data/toolbar-items.json'});

        this.getReference('toolbar').add(items)
    }
}

export default Neo.setupClass(Viewport);
