import BaseViewport from '../../../src/container/Viewport.mjs';
import Component    from '../../../src/component/Base.mjs';
import TabContainer from '../../../src/tab/Container.mjs';

/**
 * @class DevRank.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='DevRank.view.Viewport'
         * @protected
         */
        className: 'DevRank.view.Viewport',
        /*
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},

        /**
         * @member {Object[]} items
         */
        items: [{
            module: TabContainer,
            height: 300,
            width : 500,
            style : {flex: 'none', margin: '20px'},

            itemDefaults: {
                module: Component,
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
            },

            items: [{
                header: {
                    iconCls: 'fa fa-home',
                    text   : 'Tab 1'
                },
                text: 'Welcome to your new Neo App.'
            }, {
                header: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 2'
                },
                text: 'Have fun creating something awesome!'
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);