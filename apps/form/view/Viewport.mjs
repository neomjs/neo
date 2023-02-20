import BaseViewport from '../../../src/container/Viewport.mjs';
import SideNavList  from './SideNavList.mjs';

/**
 * @class Form.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Form.view.Viewport'
         * @protected
         */
        className: 'Form.view.Viewport',
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            width: '300',

            items: [{
                flex: 'none',
                vdom: {tag: 'h1', innerHTML: 'My Form Header'}
            }, {
                module: SideNavList
            }]
        }, {
            ntype: 'container',
            html : 'Content'
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

Neo.applyClassConfig(Viewport);

export default Viewport;
