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
        layout   : 'base',
        style    : {padding: '1em'},

        items: [{
            module: Toolbar,

            style: {
                backgroundColor: '#f2f2f2',
                padding        : '10px 5px 10px 10px'
            }
        }, {
            module : Button,
            handler: 'up.onLoadItemsButtonClick',
            style  : {marginTop: '1em'},
            text   : 'Load Toolbar Items'
        }]
    }

    /**
     * @param {Object} data
     */
    onLoadItemsButtonClick(data) {
        console.log('hi');
    }
}

export default Neo.setupClass(Viewport);
